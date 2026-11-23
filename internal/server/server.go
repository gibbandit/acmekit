// Package server composes Acme's GraphQL API, session authentication, policy,
// and embedded frontend into one ordinary Go HTTP handler.
package server

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"time"

	"github.com/alexedwards/scs/v2"
	"github.com/gibbandit/acmekit/internal/authz"
	"github.com/gibbandit/acmekit/internal/projects"
	"github.com/gibbandit/acmekit/routeadapter"
	"github.com/go-chi/chi/v5"
	"github.com/graphql-go/graphql"
	"golang.org/x/oauth2"
)

// Config contains server configuration. GitHub authentication is optional, but
// both credentials and an appropriate PublicURL must be supplied to enable it.
// DemoMode must only be enabled on a loopback listener; cmd/acme enforces this.
type Config struct {
	DemoMode           bool
	CookieSecure       bool
	PublicURL          string
	GitHubClientID     string
	GitHubClientSecret string
	Operations         []byte
	Version            string
	Logger             *slog.Logger
}

type server struct {
	config          Config
	log             *slog.Logger
	sessions        *scs.SessionManager
	projects        *projects.Store
	policy          *authz.Policy
	schema          graphql.Schema
	operations      map[string]persistedOperation
	cursorKey       [32]byte
	frontend        http.Handler
	oauth           *oauth2.Config
	oauthHTTPClient *http.Client
	githubUserURL   string
}

type principal struct {
	ID        string
	Name      string
	Role      string
	AvatarURL string
	Namespace string
	Demo      bool
}

type principalKey struct{}

// New builds a complete handler. A nil assets filesystem enables API-only mode.
// A non-nil filesystem must contain the built frontend and its
// route-shells.json manifest. All state is process-local, including sessions and
// sample data.
func New(config Config, assets fs.FS) (http.Handler, error) {
	s, err := newServer(config, assets)
	if err != nil {
		return nil, err
	}
	return s.handler(), nil
}

func newServer(config Config, assets fs.FS) (*server, error) {
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	if config.Version == "" {
		config.Version = "development"
	}
	if config.PublicURL == "" {
		config.PublicURL = "http://127.0.0.1:8080"
	}
	publicURL, err := parsePublicURL(config.PublicURL)
	if err != nil {
		return nil, err
	}
	if publicURL.Scheme == "https" {
		config.CookieSecure = true
	}
	operations, err := loadOperations(config.Operations)
	if err != nil {
		return nil, err
	}
	s := &server{
		config: config, log: config.Logger, projects: projects.NewStore(), operations: operations,
		frontend:      http.NotFoundHandler(),
		githubUserURL: "https://api.github.com/user",
		oauthHTTPClient: &http.Client{
			Timeout:       12 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
	if _, err := rand.Read(s.cursorKey[:]); err != nil {
		return nil, fmt.Errorf("initialize cursor signing key: %w", err)
	}
	policy, err := authz.New(context.Background())
	if err != nil {
		return nil, err
	}
	s.policy = policy
	s.sessions = scs.New()
	s.sessions.Lifetime = 12 * time.Hour
	s.sessions.IdleTimeout = time.Hour
	s.sessions.Cookie.Name = "acme_session"
	if config.CookieSecure {
		s.sessions.Cookie.Name = "__Host-acme_session"
	}
	s.sessions.Cookie.HttpOnly = true
	s.sessions.Cookie.Secure = config.CookieSecure
	s.sessions.Cookie.SameSite = http.SameSiteLaxMode
	s.sessions.Cookie.Path = "/"
	s.sessions.Cookie.Persist = false
	s.sessions.ErrorFunc = func(w http.ResponseWriter, _ *http.Request, err error) {
		s.log.Error("session operation failed", "error", err)
		writeAPIError(w, http.StatusInternalServerError, "SESSION_ERROR", "Unable to save the session. Please try again.")
	}
	if err := s.configureGitHub(publicURL); err != nil {
		return nil, err
	}
	s.schema, err = s.buildSchema()
	if err != nil {
		return nil, fmt.Errorf("build GraphQL schema: %w", err)
	}
	if assets != nil {
		s.frontend, err = routeadapter.Frontend(assets, s.routeAdapterOptions())
		if err != nil {
			return nil, err
		}
	}
	return s, nil
}

func (s *server) handler() http.Handler {
	router := chi.NewRouter()
	router.Use(s.recoverPanics)
	router.Use(s.withPrincipal)
	router.HandleFunc("/graphql", s.serveGraphQL)
	router.HandleFunc("/auth/demo", s.demoLogin)
	router.HandleFunc("/auth/logout", s.logout)
	router.HandleFunc("/auth/github", s.githubLogin)
	router.HandleFunc("/auth/github/callback", s.githubCallback)
	router.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	router.Get("/*", s.frontend.ServeHTTP)
	router.Head("/*", s.frontend.ServeHTTP)
	router.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "This endpoint does not exist.")
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "This HTTP method is not supported.")
	})
	csrf := &http.CrossOriginProtection{}
	csrf.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeAPIError(w, http.StatusForbidden, "CROSS_ORIGIN_REQUEST", "Cross-origin requests are not allowed.")
	}))
	return s.securityHeaders(csrf.Handler(s.sessions.LoadAndSave(router)))
}

func (s *server) withPrincipal(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		id := s.sessions.GetString(ctx, "user_id")
		namespace := s.sessions.GetString(ctx, "namespace")
		role := s.sessions.GetString(ctx, "role")
		if id != "" && namespace != "" && (role == "MAINTAINER" || role == "MEMBER") {
			user := &principal{
				ID: id, Namespace: namespace, Role: role,
				Name:      s.sessions.GetString(ctx, "name"),
				AvatarURL: s.sessions.GetString(ctx, "avatar_url"),
				Demo:      s.sessions.GetBool(ctx, "demo"),
			}
			r = r.WithContext(context.WithValue(ctx, principalKey{}, user))
		}
		next.ServeHTTP(w, r)
	})
}

func currentUser(ctx context.Context) *principal {
	user, _ := ctx.Value(principalKey{}).(*principal)
	return user
}

func (s *server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// This policy permits the static shell's inline hydration scripts.
		w.Header().Set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'")
		if s.config.CookieSecure {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if cause := recover(); cause != nil {
				s.log.Error("request handler panicked", "method", r.Method, "path", r.URL.Path, "panic", cause, "stack", string(debug.Stack()))
				writeAPIError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong. Please try again.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Use "+method+" for this endpoint.")
	return false
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeAPIError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, map[string]string{"error": message, "code": code})
}

func parsePublicURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("ACME_PUBLIC_URL must be an absolute HTTP(S) origin without a path, credentials, query, or fragment")
	}
	u.Path = ""
	return u, nil
}
