package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

func (s *server) demoLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !s.config.DemoMode {
		writeAPIError(w, http.StatusNotFound, "DEMO_DISABLED", "Demo sign-in is disabled. Start Acme with --demo on a loopback address to try it.")
		return
	}
	var input struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, &input, 1024) {
		return
	}
	if input.Role != "MAINTAINER" && input.Role != "MEMBER" {
		writeAPIError(w, http.StatusBadRequest, "BAD_USER_INPUT", "Choose MAINTAINER or MEMBER.")
		return
	}
	id := "demo_" + rand.Text()
	name := "Alex Morgan"
	if input.Role == "MEMBER" {
		name = "Jordan Lee"
	}
	user := &principal{ID: id, Namespace: id, Name: name, Role: input.Role, Demo: true}
	if err := s.establishSession(r.Context(), user); err != nil {
		s.log.Error("demo login failed", "error", err)
		writeAPIError(w, http.StatusServiceUnavailable, "LOGIN_FAILED", "Unable to create a demo workspace. Please try again.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	if _, err := io.Copy(io.Discard, r.Body); err != nil {
		writeAPIError(w, http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "The logout request is too large.")
		return
	}
	user := currentUser(r.Context())
	if err := s.sessions.Destroy(r.Context()); err != nil {
		s.log.Error("logout failed", "error", err)
		writeAPIError(w, http.StatusInternalServerError, "LOGOUT_FAILED", "Unable to end the session. Please try again.")
		return
	}
	if user != nil && user.Demo {
		s.projects.DeleteDemoWorkspace(user.Namespace)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) establishSession(ctx context.Context, user *principal) error {
	if err := s.projects.EnsureWorkspace(user.Namespace, user.Demo); err != nil {
		return err
	}
	if err := s.sessions.RenewToken(ctx); err != nil {
		return err
	}
	if err := s.sessions.Clear(ctx); err != nil {
		return err
	}
	s.sessions.Put(ctx, "user_id", user.ID)
	s.sessions.Put(ctx, "namespace", user.Namespace)
	s.sessions.Put(ctx, "name", user.Name)
	s.sessions.Put(ctx, "role", user.Role)
	s.sessions.Put(ctx, "avatar_url", user.AvatarURL)
	s.sessions.Put(ctx, "demo", user.Demo)
	if previous := currentUser(ctx); previous != nil && previous.Demo && previous.Namespace != user.Namespace {
		s.projects.DeleteDemoWorkspace(previous.Namespace)
	}
	return nil
}

func (s *server) configureGitHub(publicURL *url.URL) error {
	if s.config.GitHubClientID == "" && s.config.GitHubClientSecret == "" {
		return nil
	}
	if s.config.GitHubClientID == "" || s.config.GitHubClientSecret == "" {
		return errors.New("set both ACME_GITHUB_CLIENT_ID and ACME_GITHUB_CLIENT_SECRET to enable GitHub sign-in")
	}
	host := publicURL.Hostname()
	ip := net.ParseIP(host)
	if publicURL.Scheme != "https" && host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return errors.New("GitHub sign-in requires an HTTPS ACME_PUBLIC_URL, except on localhost or a loopback IP")
	}
	callback := *publicURL
	callback.Path = "/auth/github/callback"
	s.oauth = &oauth2.Config{
		ClientID:     s.config.GitHubClientID,
		ClientSecret: s.config.GitHubClientSecret,
		Endpoint:     github.Endpoint,
		RedirectURL:  callback.String(),
		Scopes:       []string{"read:user"},
	}
	return nil
}

func (s *server) githubLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.oauth == nil {
		writeAPIError(w, http.StatusNotFound, "GITHUB_DISABLED", "GitHub sign-in is not configured.")
		return
	}
	state, verifier := rand.Text(), oauth2.GenerateVerifier()
	if err := s.sessions.RenewToken(r.Context()); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "LOGIN_FAILED", "Unable to start sign-in. Please try again.")
		return
	}
	s.sessions.Put(r.Context(), "oauth_state", state)
	s.sessions.Put(r.Context(), "oauth_verifier", verifier)
	s.sessions.Put(r.Context(), "oauth_started", time.Now().Unix())
	http.Redirect(w, r, s.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func (s *server) githubCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.oauth == nil {
		writeAPIError(w, http.StatusNotFound, "GITHUB_DISABLED", "GitHub sign-in is not configured.")
		return
	}
	state := s.sessions.GetString(r.Context(), "oauth_state")
	verifier := s.sessions.GetString(r.Context(), "oauth_verifier")
	started := s.sessions.GetInt64(r.Context(), "oauth_started")
	// Consume the pending attempt even on failure; a callback cannot be replayed.
	s.sessions.Remove(r.Context(), "oauth_state")
	s.sessions.Remove(r.Context(), "oauth_verifier")
	s.sessions.Remove(r.Context(), "oauth_started")
	query := r.URL.Query()
	providedState := query.Get("state")
	age := time.Now().Unix() - started
	if state == "" || verifier == "" || len(query["state"]) != 1 || subtle.ConstantTimeCompare([]byte(state), []byte(providedState)) != 1 || age < 0 || age > 600 {
		writeAPIError(w, http.StatusBadRequest, "INVALID_OAUTH_STATE", "This sign-in attempt expired or could not be verified. Please start again.")
		return
	}
	if query.Get("error") != "" {
		writeAPIError(w, http.StatusBadRequest, "OAUTH_CANCELLED", "GitHub sign-in was not completed. Return to Acme to try again.")
		return
	}
	code := query.Get("code")
	if code == "" || len(code) > 2048 || len(query["code"]) != 1 {
		writeAPIError(w, http.StatusBadRequest, "INVALID_OAUTH_CODE", "GitHub did not provide a valid authorization code.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	ctx = context.WithValue(ctx, oauth2.HTTPClient, s.oauthHTTPClient)
	token, err := s.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		// Provider error bodies can contain sensitive values; do not log them.
		s.log.Warn("GitHub token exchange failed")
		writeAPIError(w, http.StatusBadGateway, "GITHUB_UNAVAILABLE", "Unable to finish GitHub sign-in. Please start again.")
		return
	}
	profile, err := s.fetchGitHubProfile(ctx, token)
	if err != nil {
		s.log.Warn("GitHub profile lookup failed")
		writeAPIError(w, http.StatusBadGateway, "GITHUB_UNAVAILABLE", "Unable to load your GitHub account. Please start again.")
		return
	}
	// A verified GitHub identity owns its own in-memory sample workspace.
	// This role grants no access to any other user's workspace.
	id := "github_" + strconv.FormatInt(profile.ID, 10)
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = profile.Login
	}
	avatar := ""
	if u, err := url.Parse(profile.AvatarURL); err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil {
		avatar = u.String()
	}
	user := &principal{ID: id, Namespace: id, Name: name, Role: "MAINTAINER", AvatarURL: avatar}
	if err := s.establishSession(r.Context(), user); err != nil {
		s.log.Error("GitHub session creation failed", "error", err)
		writeAPIError(w, http.StatusServiceUnavailable, "LOGIN_FAILED", "Unable to create your session. Please try again.")
		return
	}
	// Never accept a redirect destination from the OAuth query or user input.
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

type githubProfile struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

func (s *server) fetchGitHubProfile(ctx context.Context, token *oauth2.Token) (githubProfile, error) {
	var profile githubProfile
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, s.githubUserURL, nil)
	if err != nil {
		return profile, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	request.Header.Set("User-Agent", "acme-template")
	// Use the configured HTTP client to keep its redirect policy in effect.
	token.SetAuthHeader(request)
	response, err := s.oauthHTTPClient.Do(request)
	if err != nil {
		return profile, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return profile, fmt.Errorf("GitHub returned HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return profile, errors.New("invalid GitHub profile response")
	}
	if err := json.Unmarshal(data, &profile); err != nil || profile.ID <= 0 || profile.Login == "" {
		return githubProfile{}, errors.New("invalid GitHub identity")
	}
	return profile, nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		writeAPIError(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Send an application/json request.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			writeAPIError(w, http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "The request is too large.")
		} else {
			writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "Send a single valid JSON object with the expected fields.")
		}
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			writeAPIError(w, http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "The request is too large.")
		} else {
			writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "Send exactly one JSON object.")
		}
		return false
	}
	return true
}
