package server

import (
	"bytes"
	"encoding/json"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"testing/synctest"
	"time"

	"github.com/gibbandit/acmekit/routeadapter"
	"github.com/graphql-go/graphql"
)

const bootstrapHTML = `<!doctype html><html><body><!--$--><main>Loading<!-- --> projects</main><!--/$-->` + bootstrapSlot + `</body></html>`
const workspaceTestQuery = `query Workspace { viewer { id } serverInfo { ...Info } } fragment Info on ServerInfo { name }`

func bootstrapFiles(t *testing.T, preloads []pagePreload) fstest.MapFS {
	t.Helper()
	manifest, err := json.Marshal(routeShellManifest{
		Version: 3, Fallback: "_shell.html",
		Routes: []routeShell{{Pattern: "/projects/$projectId", File: "_routes/detail.html", RouteID: "/_app/projects_/$projectId", Segments: []routeadapter.Segment{{Kind: "static", Value: "projects"}, {Kind: "param", Name: "projectId"}}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	return fstest.MapFS{
		"route-shells.json":   {Data: manifest},
		"_shell.html":         {Data: []byte(preloadMetadataHTML(t, "Sign in", []pagePreload{}))},
		"_routes/detail.html": {Data: []byte(preloadMetadataHTML(t, "Loading projects", preloads))},
	}
}

type pageData struct {
	ID        string         `json:"id"`
	Variables map[string]any `json:"variables"`
	Response  graphResult    `json:"response"`
}

func readPageDataWithHTML(t *testing.T, client *http.Client, endpoint, expectedHTML string) ([]pageData, string) {
	t.Helper()
	response, err := client.Get(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	return readBootstrapResponse(t, response, expectedHTML)
}

func readBootstrapResponse(t *testing.T, response *http.Response, expectedHTML string) ([]pageData, string) {
	t.Helper()
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("page HTTP %d: %s (%v)", response.StatusCode, body, err)
	}
	if response.Header.Get("Cache-Control") != "private, no-store" {
		t.Fatalf("personalized HTML may be cached: %v", response.Header)
	}
	prefix := strings.TrimSuffix(bootstrapSlot, `[]</script>`)
	before, rest, ok := strings.Cut(string(body), prefix)
	payload, after, closed := strings.Cut(rest, "</script>")
	if !ok || !closed || before+prefix+"[]</script>"+after != expectedHTML {
		t.Fatal("bootstrap changed React HTML outside the deliberate slot")
	}
	var entries []pageData
	if err := json.Unmarshal([]byte(payload), &entries); err != nil {
		t.Fatalf("invalid bootstrap JSON: %v", err)
	}
	return entries, string(body)
}

func TestBootstrapMetadataSelectsHTMLForCurrentSession(t *testing.T) {
	pathName, scopeName, minimum, maximum := "recordID", "organizationID", 1.0, 50.0
	workspace := pagePreload{ID: "workspace", Variables: map[string]variableBinding{}}
	preloads := []pagePreload{
		workspace,
		{ID: "detail", Authenticated: true, Variables: map[string]variableBinding{"id": {Source: "path", Name: &pathName}}},
		{ID: "list", Authenticated: true, Variables: map[string]variableBinding{
			"first":  {Source: "query", Type: "int", Default: 6, Min: &minimum, Max: &maximum},
			"search": {Source: "path", Name: &scopeName},
		}},
	}
	publicHTML := preloadMetadataHTML(t, "Sign in", []pagePreload{})
	overviewHTML := preloadMetadataHTML(t, "Overview loading", []pagePreload{workspace})
	detailHTML := preloadMetadataHTML(t, "Project loading", preloads)
	manifest := routeShellManifest{
		Version: 3, Fallback: "_shell.html",
		Routes: []routeShell{
			{Pattern: "/", File: "index.html", RouteID: "/_app/", Segments: []routeadapter.Segment{}},
			{Pattern: "/organizations/$organizationID/records/$recordID", File: "_routes/project-detail.html", RouteID: "/_app/organizations_/$organizationID/records/$recordID", Segments: []routeadapter.Segment{{Kind: "static", Value: "organizations"}, {Kind: "param", Name: "organizationID"}, {Kind: "static", Value: "records"}, {Kind: "param", Name: "recordID"}}},
		},
	}
	files := frontendFiles(t, manifest)
	files["_shell.html"].Data = []byte(publicHTML)
	files["index.html"].Data = []byte(overviewHTML)
	files["_routes/project-detail.html"].Data = []byte(detailHTML)
	operations, err := json.Marshal(map[string]string{
		"workspace": workspaceTestQuery,
		"detail":    `query Detail($id: ID!) { project(id: $id) { id name } }`,
		"list":      connectionQuery,
	})
	if err != nil {
		t.Fatal(err)
	}
	staleName := "projectId"
	for _, tc := range []struct {
		name, parameter string
		binding         variableBinding
	}{
		{"stale explicit name", staleName, variableBinding{Source: "path", Name: &staleName}},
		{"missing implicit name", "id", variableBinding{Source: "path"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			invalidFiles := maps.Clone(files)
			invalidFiles["_routes/project-detail.html"] = &fstest.MapFile{Data: []byte(preloadMetadataHTML(t, "Project loading", []pagePreload{
				workspace,
				{ID: "detail", Authenticated: true, Variables: map[string]variableBinding{"id": tc.binding}},
			}))}
			_, err := New(Config{Operations: operations}, invalidFiles)
			if err == nil || !strings.Contains(err.Error(), "unknown path parameter "+strconv.Quote(tc.parameter)) {
				t.Fatalf("server accepted an unknown path binding or returned the wrong error: %v", err)
			}
		})
	}
	app, err := newServer(Config{DemoMode: true, Operations: operations}, files)
	if err != nil {
		t.Fatal(err)
	}
	host := httptest.NewServer(app.handler())
	t.Cleanup(host.Close)
	owner, anonymous := browser(t), browser(t)
	login(t, owner, host.URL, "MAINTAINER")
	for _, tc := range []struct {
		path, html string
		entries    int
	}{
		{"/", overviewHTML, 1},
		{"/organizations/actual-organization/records/actual-record-id?first=2", detailHTML, 3},
	} {
		t.Run(tc.path, func(t *testing.T) {
			entries, _ := readPageDataWithHTML(t, anonymous, host.URL+tc.path, publicHTML)
			if len(entries) != 1 || entries[0].ID != "workspace" || string(entries[0].Response.Data["viewer"]) != "null" {
				t.Fatalf("anonymous bootstrap must contain only its public Workspace result: %+v", entries)
			}
			entries, _ = readPageDataWithHTML(t, owner, host.URL+tc.path, tc.html)
			if len(entries) != tc.entries || string(entries[0].Response.Data["viewer"]) == "null" {
				t.Fatalf("authenticated bootstrap lost its session or page operations: %+v", entries)
			}
			if tc.entries == 3 && (entries[1].Variables["id"] != "actual-record-id" || entries[2].Variables["first"] != float64(2) || entries[2].Variables["search"] != "actual-organization") {
				t.Fatalf("shell selection changed the original route's variables: %+v", entries)
			}
		})
	}
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/organizations/actual-organization/records/actual-record-id?first=51", http.StatusBadRequest},
		{http.MethodHead, "/organizations/actual-organization/records/actual-record-id?first=2", http.StatusOK},
	} {
		request, err := http.NewRequest(tc.method, host.URL+tc.path, nil)
		if err != nil {
			t.Fatal(err)
		}
		response, err := anonymous.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != tc.status || response.Header.Get("Cache-Control") != "private, no-store" || (tc.method == http.MethodHead && len(body) != 0) {
			t.Fatalf("public shell changed validation or HEAD behavior: %s %d %q %v (%v)", tc.method, response.StatusCode, body, response.Header, err)
		}
	}
}

func TestBootstrapSessionsAndPersistedOperations(t *testing.T) {
	pathName, minimum, maximum := "projectId", 1.0, 50.0
	preloads := []pagePreload{
		{ID: "workspace", Variables: map[string]variableBinding{}},
		{ID: "detail", Authenticated: true, Variables: map[string]variableBinding{"id": {Source: "path", Name: &pathName}}},
		{ID: "list", Authenticated: true, Variables: map[string]variableBinding{
			"first": {Source: "query", Type: "int", Default: 6, Min: &minimum, Max: &maximum},
		}},
	}
	operations, _ := json.Marshal(map[string]string{
		"workspace":  workspaceTestQuery,
		"detail":     `query Detail($id: ID!) { project(id: $id) { id name } }`,
		"list":       connectionQuery,
		"create":     createMutation,
		"historical": `query Old { removedField }`,
	})
	files := bootstrapFiles(t, preloads)
	privateHTML, publicHTML := string(files["_routes/detail.html"].Data), string(files["_shell.html"].Data)
	app, err := newServer(Config{DemoMode: true, Operations: operations}, files)
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int64
	info := app.schema.QueryType().Fields()["serverInfo"]
	resolveInfo := info.Resolve
	info.Resolve = func(params graphql.ResolveParams) (any, error) {
		calls.Add(1)
		return resolveInfo(params)
	}
	host := httptest.NewServer(app.handler())
	t.Cleanup(host.Close)
	owner, other, anonymous := browser(t), browser(t), browser(t)
	login(t, owner, host.URL, "MAINTAINER")
	login(t, other, host.URL, "MAINTAINER")
	name := `</script><script>alert("test")</script>&`
	status, body, _ := postJSON(t, owner, host.URL+"/graphql", map[string]any{
		"id": "create", "variables": map[string]any{"input": map[string]any{"name": name, "description": "", "status": "ACTIVE"}},
	}, host.URL)
	var created graphResult
	if err := json.Unmarshal(body, &created); err != nil || status != http.StatusOK {
		t.Fatalf("persisted mutation HTTP %d: %s (%v)", status, body, err)
	}
	project := dataAs[struct{ Project projectResult }](t, created, "createProject").Project
	endpoint := host.URL + "/projects/" + project.ID
	entries, html := readPageDataWithHTML(t, owner, endpoint+"?first=1&first=50", privateHTML)
	if len(entries) != 3 || entries[1].Variables["id"] != project.ID || dataAs[projectResult](t, entries[1].Response, "project").Name != name {
		t.Fatalf("wrong private bootstrap: %+v", entries)
	}
	if entries[2].Variables["first"] != float64(1) || len(dataAs[connectionResult](t, entries[2].Response, "projects").Edges) != 1 {
		t.Fatalf("query bindings did not use first value: %+v", entries[2])
	}
	if strings.Contains(html, name) || !strings.Contains(html, `\u003c/script\u003e`) {
		t.Fatal("bootstrap JSON did not escape script content")
	}
	entries, _ = readPageDataWithHTML(t, other, endpoint, privateHTML)
	if dataAs[*projectResult](t, entries[1].Response, "project") != nil {
		t.Fatal("bootstrap crossed session namespaces")
	}
	entries, _ = readPageDataWithHTML(t, anonymous, endpoint, publicHTML)
	if len(entries) != 1 || string(entries[0].Response.Data["viewer"]) != "null" {
		t.Fatalf("anonymous page preloaded private operations: %+v", entries)
	}
	noErrors(t, graph(t, owner, host.URL, updateMutation, map[string]any{"input": map[string]any{
		"id": project.ID, "name": "Updated", "description": "", "status": "ACTIVE",
	}}))
	entries, _ = readPageDataWithHTML(t, owner, endpoint, privateHTML)
	if dataAs[projectResult](t, entries[1].Response, "project").Name != "Updated" {
		t.Fatal("bootstrap reused stale data")
	}
	before := calls.Load()
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		url := endpoint + "?first=51"
		want := http.StatusBadRequest
		if method == http.MethodHead {
			url, want = endpoint, http.StatusOK
		}
		request, _ := http.NewRequest(method, url, nil)
		response, err := owner.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != want || calls.Load() != before {
			t.Fatalf("%s executed preloads or returned wrong status: %d, calls %d -> %d", method, response.StatusCode, before, calls.Load())
		}
	}
	for _, tc := range []struct{ path, html string }{
		{"/_routes/detail.html", privateHTML},
		{"/unknown/page", publicHTML},
	} {
		response, err := owner.Get(host.URL + tc.path)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || string(body) != tc.html || calls.Load() != before {
			t.Fatalf("raw/fallback HTML should remain pristine: %s (%v)", body, err)
		}
	}
	status, body, _ = postJSON(t, owner, host.URL+"/graphql", map[string]any{"id": "missing"}, host.URL)
	var missing graphResult
	if err := json.Unmarshal(body, &missing); err != nil || status != http.StatusBadRequest {
		t.Fatalf("unknown persisted ID HTTP %d: %s (%v)", status, body, err)
	}
	errorCode(t, missing, "UNKNOWN_OPERATION")
}

func TestBootstrapTimeoutPreservesCompletedQueries(t *testing.T) {
	operations := []byte(`{"workspace":"query { viewer { id } }","slow":"query Slow { serverInfo { name } }","later":"query Later { serverInfo { name } }"}`)
	files := bootstrapFiles(t, []pagePreload{
		{ID: "workspace", Variables: map[string]variableBinding{}},
		{ID: "slow", Variables: map[string]variableBinding{}},
		{ID: "later", Variables: map[string]variableBinding{}},
	})
	pageFile := files["_routes/detail.html"]
	pageFile.Data = bytes.Replace(pageFile.Data, []byte(`"version":1`), []byte(`"version":1,"preloadTimeoutMs":750`), 1)
	app, err := newServer(Config{Operations: operations}, files)
	if err != nil {
		t.Fatal(err)
	}
	viewer := app.schema.QueryType().Fields()["viewer"]
	resolveViewer := viewer.Resolve
	viewer.Resolve = func(params graphql.ResolveParams) (any, error) {
		time.Sleep(250 * time.Millisecond)
		return resolveViewer(params)
	}
	var calls atomic.Int64
	app.schema.QueryType().Fields()["serverInfo"].Resolve = func(params graphql.ResolveParams) (any, error) {
		calls.Add(1)
		<-params.Context.Done()
		return nil, params.Context.Err()
	}
	synctest.Test(t, func(t *testing.T) {
		handler := app.handler()
		page := httptest.NewRecorder()
		started := time.Now()
		handler.ServeHTTP(page, httptest.NewRequest(http.MethodGet, "/projects/example", nil))
		synctest.Wait()
		if elapsed := time.Since(started); elapsed != 750*time.Millisecond || calls.Load() != 1 {
			t.Fatalf("page took %v and ran %d slow preloads, want 750ms and 1 slow preload", elapsed, calls.Load())
		}
		entries, _ := readBootstrapResponse(t, page.Result(), string(files["_shell.html"].Data))
		if len(entries) != 1 || entries[0].ID != "workspace" || string(entries[0].Response.Data["viewer"]) != "null" {
			t.Fatalf("page did not preserve its completed Workspace response: %+v", entries)
		}

		api := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(`{"id":"slow"}`))
		request.Header.Set("Content-Type", "application/json")
		started = time.Now()
		handler.ServeHTTP(api, request)
		if elapsed := time.Since(started); elapsed != 8*time.Second || api.Code != http.StatusGatewayTimeout {
			t.Fatalf("GraphQL request took %v and returned HTTP %d: %s", elapsed, api.Code, api.Body)
		}
		var result graphResult
		if err := json.Unmarshal(api.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		errorCode(t, result, "TIMEOUT")
	})
}

func TestBootstrapRejectsInvalidBuildData(t *testing.T) {
	operations, err := loadOperations([]byte(`{"query":"query { viewer { id } }","mutation":"mutation { deleteProject(input:{id:\"x\"}) { deletedProjectId } }"}`))
	if err != nil {
		t.Fatal(err)
	}
	app := &server{operations: operations}
	for _, tc := range []struct{ id, html string }{
		{"missing", bootstrapHTML},
		{"mutation", bootstrapHTML},
		{"query", "<main>no slot</main>"},
		{"query", bootstrapHTML + bootstrapSlot},
	} {
		files := bootstrapFiles(t, []pagePreload{{ID: tc.id, Variables: map[string]variableBinding{}}})
		files["_routes/detail.html"].Data = []byte(preloadMetadataPrefix + `{"version":1,"preloads":[{"id":"` + tc.id + `","variables":{}}]}</script>` + tc.html)
		if _, err := routeadapter.Frontend(files, app.routeAdapterOptions()); err == nil {
			t.Fatalf("accepted invalid bootstrap input: %s %s", tc.id, tc.html)
		}
	}
	if _, err := loadOperations([]byte(`{"multiple":"query A { viewer { id } } query B { viewer { id } }"}`)); err == nil {
		t.Fatal("accepted multiple operations for one persisted ID")
	}
}
