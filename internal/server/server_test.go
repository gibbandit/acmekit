package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

type graphResult struct {
	Data   map[string]json.RawMessage `json:"data"`
	Errors []struct {
		Message    string `json:"message"`
		Extensions struct {
			Code string `json:"code"`
		} `json:"extensions"`
	} `json:"errors"`
}

type projectResult struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status"`
}

type connectionResult struct {
	TotalCount int `json:"totalCount"`
	Edges      []struct {
		Cursor string        `json:"cursor"`
		Node   projectResult `json:"node"`
	} `json:"edges"`
	PageInfo struct {
		HasNextPage     bool    `json:"hasNextPage"`
		HasPreviousPage bool    `json:"hasPreviousPage"`
		StartCursor     *string `json:"startCursor"`
		EndCursor       *string `json:"endCursor"`
	} `json:"pageInfo"`
}

const connectionQuery = `query Projects($first: Int, $after: String, $search: String, $status: ProjectStatus) {
  projects(first: $first, after: $after, search: $search, status: $status) {
    totalCount edges { cursor node { id name description status } }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
  }
}`

const createMutation = `mutation Create($input: CreateProjectInput!) {
  createProject(input: $input) { clientMutationId project { id name description status } }
}`
const updateMutation = `mutation Update($input: UpdateProjectInput!) {
  updateProject(input: $input) { clientMutationId project { id name description status } }
}`
const deleteMutation = `mutation Delete($input: DeleteProjectInput!) {
  deleteProject(input: $input) { clientMutationId deletedProjectId }
}`

func fixture(t *testing.T, config Config) (*server, *httptest.Server) {
	t.Helper()
	config.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := newServer(config, fstest.MapFS{
		"route-shells.json": &fstest.MapFile{Data: []byte(`{"version":3,"fallback":"_shell.html","routes":[]}`)},
		"_shell.html":       &fstest.MapFile{Data: []byte(preloadMetadataHTML(t, "Acme test shell", []pagePreload{}))},
		"assets/app-123.js": &fstest.MapFile{Data: []byte("console.log('acme')")},
		"acme.svg":          &fstest.MapFile{Data: []byte("<svg></svg>")},
	})
	if err != nil {
		t.Fatal(err)
	}
	webServer := httptest.NewServer(app.handler())
	t.Cleanup(webServer.Close)
	return app, webServer
}

func browser(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar, Timeout: 10 * time.Second}
}

func postJSON(t *testing.T, client *http.Client, endpoint string, value any, origin string) (int, []byte, http.Header) {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, data, response.Header
}

func graph(t *testing.T, client *http.Client, origin, query string, variables map[string]any) graphResult {
	t.Helper()
	status, body, headers := postJSON(t, client, origin+"/graphql", map[string]any{"query": query, "variables": variables}, origin)
	if status != http.StatusOK {
		t.Fatalf("GraphQL HTTP %d: %s", status, body)
	}
	if headers.Get("Cache-Control") != "no-store" {
		t.Fatalf("private API response may be cached: %v", headers)
	}
	var result graphResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("decode GraphQL: %v: %s", err, body)
	}
	return result
}

func noErrors(t *testing.T, result graphResult) {
	t.Helper()
	if len(result.Errors) != 0 {
		t.Fatalf("unexpected GraphQL errors: %+v", result.Errors)
	}
}

func errorCode(t *testing.T, result graphResult, code string) {
	t.Helper()
	if len(result.Errors) == 0 || result.Errors[0].Extensions.Code != code {
		t.Fatalf("expected %s, got %+v", code, result)
	}
}

func dataAs[T any](t *testing.T, result graphResult, key string) T {
	t.Helper()
	noErrors(t, result)
	var target T
	if err := json.Unmarshal(result.Data[key], &target); err != nil {
		t.Fatalf("decode %s: %v (%s)", key, err, result.Data[key])
	}
	return target
}

func login(t *testing.T, client *http.Client, origin, role string) http.Header {
	t.Helper()
	status, body, headers := postJSON(t, client, origin+"/auth/demo", map[string]string{"role": role}, origin)
	if status != http.StatusOK {
		t.Fatalf("login HTTP %d: %s", status, body)
	}
	return headers
}

func TestPanicRecoveryLogsDetailsWithoutLeakingThem(t *testing.T) {
	const panicDetail = "private panic sentinel"
	var logs bytes.Buffer
	app := &server{log: slog.New(slog.NewJSONHandler(&logs, nil))}
	handler := app.recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(panicDetail)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/graphql", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("panic response status = %d", response.Code)
	}
	if response.Header().Get("Content-Type") != "application/json; charset=utf-8" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unexpected panic response headers: %v", response.Header())
	}
	var body map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode panic response: %v", err)
	}
	if len(body) != 2 || body["code"] != "INTERNAL_ERROR" || body["error"] != "Something went wrong. Please try again." {
		t.Fatalf("panic details leaked into response: %s", response.Body.String())
	}
	var entry struct {
		Level  string `json:"level"`
		Msg    string `json:"msg"`
		Method string `json:"method"`
		Path   string `json:"path"`
		Panic  string `json:"panic"`
		Stack  string `json:"stack"`
	}
	if err := json.Unmarshal(logs.Bytes(), &entry); err != nil {
		t.Fatalf("decode panic log: %v", err)
	}
	if entry.Level != "ERROR" || entry.Msg != "request handler panicked" || entry.Method != http.MethodPost || entry.Path != "/graphql" || entry.Panic != panicDetail {
		t.Fatalf("panic log lost diagnostic context: %+v", entry)
	}
	if !strings.Contains(entry.Stack, "server_test.go:") || !strings.Contains(entry.Stack, "recoverPanics") {
		t.Fatalf("panic log lost the handler stack: %q", entry.Stack)
	}
}

func TestAPIOnlyServer(t *testing.T) {
	handler, err := New(Config{DemoMode: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	host := httptest.NewServer(handler)
	t.Cleanup(host.Close)
	client := browser(t)
	for _, tc := range []struct {
		path   string
		status int
	}{
		{"/healthz", http.StatusOK},
		{"/", http.StatusNotFound},
		{"/projects/example", http.StatusNotFound},
		{"/assets/app.js", http.StatusNotFound},
	} {
		response, err := client.Get(host.URL + tc.path)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != tc.status {
			t.Fatalf("%s: got HTTP %d, want %d", tc.path, response.StatusCode, tc.status)
		}
	}
	query := `{ viewer { role } projects { totalCount } }`
	errorCode(t, graph(t, client, host.URL, query, nil), "UNAUTHENTICATED")
	login(t, client, host.URL, "MAINTAINER")
	result := graph(t, client, host.URL, query, nil)
	viewer := dataAs[struct{ Role string }](t, result, "viewer")
	projects := dataAs[struct{ TotalCount int }](t, result, "projects")
	if viewer.Role != "MAINTAINER" || projects.TotalCount != 10 {
		t.Fatalf("API-only session did not retain authenticated access: %+v, %+v", viewer, projects)
	}
	if _, err := New(Config{}, fstest.MapFS{}); err == nil {
		t.Fatal("non-nil assets without a frontend manifest must still fail startup")
	}
}

func TestSessionRolesCRUDAndWorkspaceIsolation(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true, Version: "test"})
	owner, member, other := browser(t), browser(t), browser(t)
	public := graph(t, owner, host.URL, `{ viewer { id } serverInfo { name version demoEnabled githubEnabled storage } }`, nil)
	noErrors(t, public)
	if string(public.Data["viewer"]) != "null" {
		t.Fatal("an anonymous request has a viewer")
	}
	errorCode(t, graph(t, owner, host.URL, `{ projects { totalCount } }`, nil), "UNAUTHENTICATED")
	info := dataAs[struct {
		Name, Version, Storage     string
		DemoEnabled, GitHubEnabled bool
	}](t, public, "serverInfo")
	if info.Name != "Acme" || info.Version != "test" || info.Storage != "memory" || !info.DemoEnabled || info.GitHubEnabled {
		t.Fatalf("incorrect server info: %+v", info)
	}

	headers := login(t, owner, host.URL, "MAINTAINER")
	setCookies := (&http.Response{Header: headers}).Cookies()
	if len(setCookies) == 0 || !setCookies[0].HttpOnly || setCookies[0].SameSite != http.SameSiteLaxMode || setCookies[0].Path != "/" {
		t.Fatalf("unsafe cookie settings: %+v", setCookies)
	}
	login(t, member, host.URL, "MEMBER")
	login(t, other, host.URL, "MAINTAINER")
	viewer := dataAs[struct {
		ID, Role          string
		CanManageProjects bool
	}](t, graph(t, owner, host.URL, `{ viewer { id role canManageProjects } }`, nil), "viewer")
	if viewer.Role != "MAINTAINER" || !viewer.CanManageProjects {
		t.Fatalf("wrong owner permissions: %+v", viewer)
	}
	memberViewer := dataAs[struct {
		Role              string
		CanManageProjects bool
	}](t, graph(t, member, host.URL, `{ viewer { role canManageProjects } }`, nil), "viewer")
	if memberViewer.Role != "MEMBER" || memberViewer.CanManageProjects {
		t.Fatalf("wrong member permissions: %+v", memberViewer)
	}
	page := dataAs[connectionResult](t, graph(t, owner, host.URL, connectionQuery, map[string]any{"first": 6}), "projects")
	if page.TotalCount != 10 || len(page.Edges) != 6 {
		t.Fatalf("incorrect seed data: %+v", page)
	}

	input := map[string]any{"name": "  Product launch  ", "description": "A clear launch plan.", "status": "PLANNED", "clientMutationId": "create-1"}
	errorCode(t, graph(t, member, host.URL, createMutation, map[string]any{"input": input}), "FORBIDDEN")
	created := dataAs[struct {
		Project          projectResult
		ClientMutationID string `json:"clientMutationId"`
	}](t, graph(t, owner, host.URL, createMutation, map[string]any{"input": input}), "createProject")
	if created.Project.Name != "Product launch" || created.Project.Status != "PLANNED" || created.ClientMutationID != "create-1" {
		t.Fatalf("wrong creation result: %+v", created)
	}
	input["id"] = created.Project.ID
	input["name"] = "Product launch, ready"
	input["status"] = "ACTIVE"
	errorCode(t, graph(t, member, host.URL, updateMutation, map[string]any{"input": input}), "FORBIDDEN")
	errorCode(t, graph(t, other, host.URL, updateMutation, map[string]any{"input": input}), "NOT_FOUND")
	updated := dataAs[struct{ Project projectResult }](t, graph(t, owner, host.URL, updateMutation, map[string]any{"input": input}), "updateProject")
	if updated.Project.Name != "Product launch, ready" || updated.Project.Status != "ACTIVE" {
		t.Fatalf("wrong update result: %+v", updated)
	}

	lookup := `query Find($id: ID!) { project(id: $id) { id name } node(id: $id) { id ... on Project { name } } }`
	owned := graph(t, owner, host.URL, lookup, map[string]any{"id": created.Project.ID})
	for _, field := range []string{"project", "node"} {
		project := dataAs[projectResult](t, owned, field)
		if project.ID != created.Project.ID || project.Name != "Product launch, ready" {
			t.Fatalf("owner %s lookup did not return the updated project: %+v", field, project)
		}
	}
	foreign := graph(t, other, host.URL, lookup, map[string]any{"id": created.Project.ID})
	noErrors(t, foreign)
	if string(foreign.Data["project"]) != "null" || string(foreign.Data["node"]) != "null" {
		t.Fatalf("project crossed workspace boundary: %+v", foreign)
	}
	foreignUser := graph(t, other, host.URL, `query Find($id: ID!) { node(id: $id) { id } }`, map[string]any{"id": viewer.ID})
	noErrors(t, foreignUser)
	if string(foreignUser.Data["node"]) != "null" {
		t.Fatal("another session's user was exposed")
	}
	stats := dataAs[struct{ Total, Active, Planned, Archived int }](t, graph(t, owner, host.URL, `{ projectStats { total active planned archived } }`, nil), "projectStats")
	if stats.Total != 11 || stats.Active+stats.Planned+stats.Archived != 11 {
		t.Fatalf("incorrect stats: %+v", stats)
	}
	otherPage := dataAs[connectionResult](t, graph(t, other, host.URL, connectionQuery, nil), "projects")
	if otherPage.TotalCount != 10 {
		t.Fatal("other workspace was mutated")
	}

	deleteInput := map[string]any{"id": created.Project.ID, "clientMutationId": "delete-1"}
	errorCode(t, graph(t, member, host.URL, deleteMutation, map[string]any{"input": deleteInput}), "FORBIDDEN")
	errorCode(t, graph(t, other, host.URL, deleteMutation, map[string]any{"input": deleteInput}), "NOT_FOUND")
	deleted := dataAs[struct{ DeletedProjectID, ClientMutationID string }](t, graph(t, owner, host.URL, deleteMutation, map[string]any{"input": deleteInput}), "deleteProject")
	if deleted.DeletedProjectID != created.Project.ID || deleted.ClientMutationID != "delete-1" {
		t.Fatalf("incorrect delete payload: %+v", deleted)
	}
	missing := graph(t, owner, host.URL, lookup, map[string]any{"id": created.Project.ID})
	noErrors(t, missing)
	if string(missing.Data["project"]) != "null" {
		t.Fatal("deleted project remains visible")
	}

	serverURL, _ := url.Parse(host.URL)
	oldCookie := owner.Jar.Cookies(serverURL)[0]
	status, body, _ := postJSON(t, owner, host.URL+"/auth/logout", map[string]any{}, host.URL)
	if status != http.StatusOK {
		t.Fatalf("logout HTTP %d: %s", status, body)
	}
	afterLogout := graph(t, owner, host.URL, `{ viewer { id } }`, nil)
	noErrors(t, afterLogout)
	if string(afterLogout.Data["viewer"]) != "null" {
		t.Fatal("viewer remains after logout")
	}
	// Replaying the pre-logout cookie must fail on the server, independently of
	// the browser removing it or resetting its Relay environment.
	request, _ := http.NewRequest(http.MethodPost, host.URL+"/graphql", strings.NewReader(`{"query":"{ viewer { id } }"}`))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(oldCookie)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var replay graphResult
	if err := json.NewDecoder(response.Body).Decode(&replay); err != nil {
		t.Fatal(err)
	}
	noErrors(t, replay)
	if string(replay.Data["viewer"]) != "null" {
		t.Fatal("a revoked session cookie was accepted")
	}
}

func TestPaginationFiltersAndInputValidation(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	client, other := browser(t), browser(t)
	login(t, client, host.URL, "MAINTAINER")
	login(t, other, host.URL, "MAINTAINER")
	seen := make(map[string]bool)
	var after any
	var firstCursor string
	for pageNumber := 0; pageNumber < 5; pageNumber++ {
		page := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"first": 3, "after": after}), "projects")
		if page.TotalCount != 10 || len(page.Edges) == 0 {
			t.Fatalf("invalid page: %+v", page)
		}
		if page.PageInfo.HasPreviousPage != (pageNumber > 0) {
			t.Fatalf("wrong previous-page flag: %+v", page.PageInfo)
		}
		if page.PageInfo.StartCursor == nil || *page.PageInfo.StartCursor != page.Edges[0].Cursor {
			t.Fatal("wrong start cursor")
		}
		if firstCursor == "" {
			firstCursor = page.Edges[0].Cursor
		}
		for _, edge := range page.Edges {
			if seen[edge.Node.ID] {
				t.Fatal("duplicate project across keyset pages")
			}
			seen[edge.Node.ID] = true
		}
		if !page.PageInfo.HasNextPage {
			break
		}
		if page.PageInfo.EndCursor == nil {
			t.Fatal("missing end cursor")
		}
		after = *page.PageInfo.EndCursor
	}
	if len(seen) != 10 {
		t.Fatalf("pagination returned %d unique records", len(seen))
	}
	zero := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"first": 0}), "projects")
	if len(zero.Edges) != 0 || !zero.PageInfo.HasNextPage || zero.PageInfo.StartCursor != nil || zero.PageInfo.EndCursor != nil {
		t.Fatalf("first:0 is not Relay-compatible: %+v", zero)
	}
	for _, variables := range []map[string]any{
		{"first": -1}, {"first": 51}, {"after": "not-a-cursor"},
		{"after": firstCursor + "changed"}, {"after": firstCursor, "status": "ACTIVE"},
		{"search": strings.Repeat("a", 201)},
	} {
		errorCode(t, graph(t, client, host.URL, connectionQuery, variables), "BAD_USER_INPUT")
	}
	errorCode(t, graph(t, other, host.URL, connectionQuery, map[string]any{"after": firstCursor}), "BAD_USER_INPUT")
	filtered := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"first": 50, "status": "PLANNED"}), "projects")
	if filtered.TotalCount != 3 || len(filtered.Edges) != 3 {
		t.Fatalf("status filter failed: %+v", filtered)
	}
	for _, edge := range filtered.Edges {
		if edge.Node.Status != "PLANNED" {
			t.Fatal("filter returned wrong status")
		}
	}
	search := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"search": " ATLAS "}), "projects")
	if search.TotalCount != 1 || search.Edges[0].Node.Name != "Atlas design system" {
		t.Fatalf("search failed: %+v", search)
	}
	empty := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"search": "no-such-project-xyz"}), "projects")
	if empty.TotalCount != 0 || len(empty.Edges) != 0 || empty.PageInfo.HasNextPage || empty.PageInfo.EndCursor != nil {
		t.Fatalf("empty connection malformed: %+v", empty)
	}
	errorCode(t, graph(t, client, host.URL, `query Bad($id: ID!) { project(id:$id) { id } }`, map[string]any{"id": "not-valid"}), "BAD_USER_INPUT")
	for _, input := range []map[string]any{
		{"name": " ", "description": "", "status": "ACTIVE"},
		{"name": strings.Repeat("x", 81), "description": "", "status": "ACTIVE"},
		{"name": "Project", "description": strings.Repeat("x", 1201), "status": "ACTIVE"},
	} {
		errorCode(t, graph(t, client, host.URL, createMutation, map[string]any{"input": input}), "BAD_USER_INPUT")
	}
}

func TestHTTPBoundaryCSRFAndDeepLinks(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	client := browser(t)
	for _, endpoint := range []string{"/auth/demo", "/auth/logout", "/graphql"} {
		status, _, _ := postJSON(t, client, host.URL+endpoint, map[string]string{"role": "MAINTAINER"}, "https://attacker.example")
		if status != http.StatusForbidden {
			t.Fatalf("cross-origin %s returned %d", endpoint, status)
		}
	}
	for _, tc := range []struct {
		Method, Path, ContentType, Body string
		Want                            int
	}{
		{http.MethodGet, "/graphql?query=mutation%20%7B%20deleteProject%20%7D", "", "", 405},
		{http.MethodGet, "/auth/demo", "", "", 405},
		{http.MethodGet, "/auth/logout", "", "", 405},
		{http.MethodPost, "/graphql", "text/plain", `{"query":"{viewer{id}}"}`, 415},
		{http.MethodPost, "/graphql", "application/json", `[{"query":"{viewer{id}}"}]`, 400},
		{http.MethodPost, "/graphql", "application/json", `{"query":"{viewer{id}}"} {}`, 400},
		{http.MethodPost, "/graphql", "application/json", `{"query":`, 400},
		{http.MethodPost, "/graphql", "application/json", `{"query":"{viewer{id}}","unknown":true}`, 400},
		{http.MethodPost, "/graphql", "application/json", `{"query":"` + strings.Repeat("a", 140<<10) + `"}`, 413},
		{http.MethodPost, "/auth/demo", "application/json", `{"role":"ADMIN"}`, 400},
		{http.MethodPost, "/auth/demo", "application/json", `{"role":"MEMBER","namespace":"someone-else"}`, 400},
		{http.MethodGet, "/auth/missing", "", "", 404},
		{http.MethodGet, "/assets/missing.js", "", "", 404},
	} {
		t.Run(fmt.Sprintf("%s %s %d", tc.Method, tc.Path, tc.Want), func(t *testing.T) {
			request, _ := http.NewRequest(tc.Method, host.URL+tc.Path, strings.NewReader(tc.Body))
			if tc.ContentType != "" {
				request.Header.Set("Content-Type", tc.ContentType)
			}
			request.Header.Set("Origin", host.URL)
			response, err := client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			body, _ := io.ReadAll(response.Body)
			if response.StatusCode != tc.Want {
				t.Fatalf("HTTP %d, expected %d: %s", response.StatusCode, tc.Want, body)
			}
		})
	}
	for _, route := range []string{"/", "/projects/some-project", "/settings/profile"} {
		response, err := client.Get(host.URL + route)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		if response.StatusCode != 200 || !bytes.Contains(body, []byte("Acme test shell")) || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/html") {
			t.Fatalf("deep link %s did not serve shell: %d %s", route, response.StatusCode, body)
		}
		if response.Header.Get("Cache-Control") != "no-cache" || response.Header.Get("X-Content-Type-Options") != "nosniff" || response.Header.Get("X-Frame-Options") != "DENY" {
			t.Fatalf("missing response protections: %v", response.Header)
		}
	}
	asset, err := client.Get(host.URL + "/assets/app-123.js")
	if err != nil {
		t.Fatal(err)
	}
	defer asset.Body.Close()
	if asset.StatusCode != 200 || !strings.Contains(asset.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("hashed asset not served correctly: %v", asset)
	}
	for _, query := range []string{
		`query { viewer { ...Cycle } } fragment Cycle on User { ...Cycle }`,
		`{` + strings.Repeat("a{", 70) + `id` + strings.Repeat("}", 71),
		`{` + strings.Repeat("a:serverInfo{name} ", 1100) + `}`,
	} {
		status, body, _ := postJSON(t, client, host.URL+"/graphql", map[string]any{"query": query}, host.URL)
		if status != 400 {
			t.Fatalf("query budget not enforced: %d %s", status, body)
		}
	}
}

func TestDemoIsOptInAndSessionsRotate(t *testing.T) {
	_, disabled := fixture(t, Config{})
	status, _, _ := postJSON(t, browser(t), disabled.URL+"/auth/demo", map[string]string{"role": "MAINTAINER"}, disabled.URL)
	if status != 404 {
		t.Fatalf("demo enabled by default: %d", status)
	}
	_, enabled := fixture(t, Config{DemoMode: true})
	client := browser(t)
	login(t, client, enabled.URL, "MEMBER")
	u, _ := url.Parse(enabled.URL)
	oldToken := client.Jar.Cookies(u)[0].Value
	login(t, client, enabled.URL, "MAINTAINER")
	if client.Jar.Cookies(u)[0].Value == oldToken {
		t.Fatal("session token not renewed on privilege change")
	}
	request, _ := http.NewRequest(http.MethodPost, enabled.URL+"/graphql", strings.NewReader(`{"query":"{ viewer { id } }"}`))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: "acme_session", Value: oldToken})
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var old graphResult
	if err := json.NewDecoder(response.Body).Decode(&old); err != nil {
		t.Fatal(err)
	}
	noErrors(t, old)
	if string(old.Data["viewer"]) != "null" {
		t.Fatal("old session token remains authorized after login")
	}
}
