package server

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"

	"golang.org/x/oauth2"
)

func TestGitHubStatePKCEAndStablePrivateWorkspace(t *testing.T) {
	var tokenCalls, profileCalls atomic.Int32
	var expectedChallenge atomic.Value
	expectedChallenge.Store("")
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			tokenCalls.Add(1)
			if r.Method != http.MethodPost {
				t.Error("token exchange did not use POST")
			}
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			verifier := r.Form.Get("code_verifier")
			digest := sha256.Sum256([]byte(verifier))
			if verifier == "" || base64.RawURLEncoding.EncodeToString(digest[:]) != expectedChallenge.Load().(string) {
				t.Error("PKCE verifier did not match the browser challenge")
			}
			if r.Form.Get("code") != "verified-code" || r.Form.Get("redirect_uri") != "http://127.0.0.1:8080/auth/github/callback" {
				t.Errorf("incorrect token request: %v", r.Form)
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"access_token":"private-test-token","token_type":"bearer","scope":"read:user"}`)
		case "/user":
			profileCalls.Add(1)
			if r.Header.Get("Authorization") != "Bearer private-test-token" {
				t.Error("profile lookup lacks the exchanged token")
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"id":42,"login":"ada","name":"Ada Lovelace","avatar_url":"https://avatars.githubusercontent.com/u/42"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()
	app, host := fixture(t, Config{GitHubClientID: "test-client", GitHubClientSecret: "test-secret", PublicURL: "http://127.0.0.1:8080"})
	app.oauth.Endpoint.TokenURL = provider.URL + "/token"
	app.githubUserURL = provider.URL + "/user"
	client := browser(t)
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	begin := func() string {
		t.Helper()
		response, err := client.Get(host.URL + "/auth/github")
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusFound {
			t.Fatalf("login start HTTP %d", response.StatusCode)
		}
		location, err := url.Parse(response.Header.Get("Location"))
		if err != nil {
			t.Fatal(err)
		}
		query := location.Query()
		if location.Hostname() != "github.com" || query.Get("client_id") != "test-client" || query.Get("code_challenge_method") != "S256" || query.Get("code_challenge") == "" || query.Get("state") == "" {
			t.Fatalf("invalid OAuth authorization request: %s", location)
		}
		if query.Get("redirect_uri") != "http://127.0.0.1:8080/auth/github/callback" {
			t.Fatal("callback origin was derived from the incoming Host")
		}
		expectedChallenge.Store(query.Get("code_challenge"))
		return query.Get("state")
	}
	callback := func(state string) *http.Response {
		t.Helper()
		response, err := client.Get(host.URL + "/auth/github/callback?" + url.Values{"state": {state}, "code": {"verified-code"}, "returnTo": {"https://attacker.example"}}.Encode())
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		return response
	}
	state := begin()
	if response := callback(state + "tampered"); response.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid state was accepted: %d", response.StatusCode)
	}
	if tokenCalls.Load() != 0 {
		t.Fatal("invalid state reached token exchange")
	}
	state = begin()
	if response := callback(state); response.StatusCode != http.StatusSeeOther || response.Header.Get("Location") != "/" {
		t.Fatalf("OAuth did not redirect safely: %d %s", response.StatusCode, response.Header.Get("Location"))
	}
	viewer := dataAs[struct {
		ID, Name, Role    string
		CanManageProjects bool
	}](t, graph(t, client, host.URL, `{viewer{id name role canManageProjects}}`, nil), "viewer")
	if viewer.Name != "Ada Lovelace" || viewer.Role != "MAINTAINER" || !viewer.CanManageProjects {
		t.Fatalf("wrong GitHub identity: %+v", viewer)
	}
	noErrors(t, graph(t, client, host.URL, createMutation, map[string]any{"input": map[string]any{"name": "Persistent this run", "description": "", "status": "ACTIVE"}}))
	status, _, _ := postJSON(t, client, host.URL+"/auth/logout", map[string]any{}, host.URL)
	if status != 200 {
		t.Fatal("GitHub logout failed")
	}
	state = begin()
	if response := callback(state); response.StatusCode != http.StatusSeeOther {
		t.Fatalf("second GitHub login failed: %d", response.StatusCode)
	}
	again := dataAs[struct{ ID string }](t, graph(t, client, host.URL, `{viewer{id}}`, nil), "viewer")
	if again.ID != viewer.ID {
		t.Fatal("verified GitHub identity was not stable across sessions")
	}
	page := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, nil), "projects")
	if page.TotalCount != 11 {
		t.Fatal("GitHub workspace was discarded on logout")
	}
	if response := callback(state); response.StatusCode != http.StatusBadRequest {
		t.Fatalf("OAuth callback replay accepted: %d", response.StatusCode)
	}
	if tokenCalls.Load() != 2 || profileCalls.Load() != 2 {
		t.Fatalf("unexpected provider calls: token=%d profile=%d", tokenCalls.Load(), profileCalls.Load())
	}
}

func TestAuthenticatedGitHubRequestDoesNotFollowRedirects(t *testing.T) {
	var redirected atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/user" {
			http.Redirect(w, r, "/leak", http.StatusFound)
			return
		}
		redirected.Add(1)
		fmt.Fprint(w, `{"id":42,"login":"ada"}`)
	}))
	defer provider.Close()
	app, _ := fixture(t, Config{})
	app.githubUserURL = provider.URL + "/user"
	if _, err := app.fetchGitHubProfile(context.Background(), &oauth2.Token{AccessToken: "sensitive"}); err == nil {
		t.Fatal("redirecting profile response accepted")
	}
	if redirected.Load() != 0 {
		t.Fatal("authenticated HTTP request followed a redirect")
	}
}

func TestConfigurationRejectsIncompleteOrInsecureOAuth(t *testing.T) {
	assets := frontendFiles(t, routeShellManifest{Version: 3, Fallback: "_shell.html"})
	for _, config := range []Config{
		{GitHubClientID: "client"},
		{GitHubClientSecret: "secret"},
		{GitHubClientID: "client", GitHubClientSecret: "secret", PublicURL: "http://acme.example"},
		{PublicURL: "https://user:password@acme.example"},
		{PublicURL: "https://acme.example/not-an-origin"},
	} {
		if _, err := New(config, assets); err == nil {
			t.Fatalf("invalid config accepted: %+v", config)
		}
	}
	app, err := newServer(Config{PublicURL: "https://acme.example"}, assets)
	if err != nil {
		t.Fatal(err)
	}
	if !app.sessions.Cookie.Secure || !app.sessions.Cookie.HttpOnly || app.sessions.Cookie.Name != "__Host-acme_session" || app.sessions.Cookie.Domain != "" || app.sessions.Cookie.Path != "/" {
		t.Fatal("HTTPS deployment does not use a secure host-scoped session cookie")
	}
}
