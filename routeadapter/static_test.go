package routeadapter

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
)

func frontendFiles(t *testing.T, manifest Manifest) fstest.MapFS {
	t.Helper()
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return fstest.MapFS{
		"route-shells.json":           {Data: data},
		"_shell.html":                 {Data: []byte(preloadMetadataHTML(t, "Generic fallback", []Preload{}))},
		"index.html":                  {Data: []byte(preloadMetadataHTML(t, "Overview", []Preload{}))},
		"projects/index.html":         {Data: []byte(preloadMetadataHTML(t, "Projects list", []Preload{}))},
		"projects/new/index.html":     {Data: []byte(preloadMetadataHTML(t, "Create project", []Preload{}))},
		"components/index.html":       {Data: []byte(preloadMetadataHTML(t, "Components", []Preload{}))},
		"docs/index.html":             {Data: []byte(preloadMetadataHTML(t, "File documentation", []Preload{}))},
		"_routes/project-detail.html": {Data: []byte(preloadMetadataHTML(t, "Project details", []Preload{}))},
		"_routes/slug.html":           {Data: []byte(preloadMetadataHTML(t, "Top-level page", []Preload{}))},
		"assets/app-abcd1234.js":      {Data: []byte("console.log('asset')")},
		"favicon.svg":                 {Data: []byte("<svg></svg>")},
		"LICENSE":                     {Data: []byte("An exact extensionless asset")},
		"auth/secret":                 {Data: []byte("must not be served")},
		"api/private.json":            {Data: []byte("must not be served")},
	}
}

func frontendManifest() Manifest {
	return Manifest{
		Version: 3, Fallback: "_shell.html",
		Routes: []RouteShell{
			{Pattern: "/", File: "index.html", RouteID: "/_app/", Segments: []Segment{}},
			{Pattern: "/projects", File: "projects/index.html", RouteID: "/_app/projects", Segments: []Segment{{Kind: "static", Value: "projects"}}},
			{Pattern: "/projects/$projectId", File: "_routes/project-detail.html", RouteID: "/_app/projects_/$projectId", Segments: []Segment{{Kind: "static", Value: "projects"}, {Kind: "param", Name: "projectId"}}},
			{Pattern: "/projects/new", File: "projects/new/index.html", RouteID: "/_app/projects_/new", Segments: []Segment{{Kind: "static", Value: "projects"}, {Kind: "static", Value: "new"}}},
			{Pattern: "/components", File: "components/index.html", RouteID: "/_app/components", Segments: []Segment{{Kind: "static", Value: "components"}}},
			{Pattern: "/docs/file.json", File: "docs/index.html", RouteID: "/_app/docs/file.json", Segments: []Segment{{Kind: "static", Value: "docs"}, {Kind: "static", Value: "file.json"}}},
			{Pattern: "/$slug", File: "_routes/slug.html", RouteID: "/_app/$slug", Segments: []Segment{{Kind: "param", Name: "slug"}}},
		},
	}
}

func TestFrontendRouteShells(t *testing.T) {
	handler, err := Frontend(frontendFiles(t, frontendManifest()), Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path string
		want string
	}{
		{"/", "Overview"},
		{"/projects", "Projects list"},
		{"/projects?search=Acme", "Projects list"},
		{"/projects/QWxwaGE", "Project details"},
		{"/projects/YmV0YQ", "Project details"},
		{"/projects/does-not-exist", "Project details"},
		{"/projects/release.v1", "Project details"},
		{"/projects/new", "Create project"},
		{"/components", "Components"},
		{"/docs/file.json", "File documentation"},
		{"/another-page", "Top-level page"},
		{"/release.v1", "Top-level page"},
		{"/projects/QWxwaGE/history", "Generic fallback"},
		{"/unmatched/nested/path", "Generic fallback"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), tc.want) {
				t.Fatalf("got %d %q; want HTML for %q", response.Code, response.Body.String(), tc.want)
			}
			if response.Header().Get("Cache-Control") != "no-cache" || response.Header().Get("Content-Type") != "text/html; charset=utf-8" {
				t.Fatalf("wrong HTML headers: %v", response.Header())
			}
		})
	}
}

func TestFrontendDocumentSelectionAndPreloadAuthentication(t *testing.T) {
	manifest := Manifest{
		Version: 3, Fallback: "_shell.html",
		Routes: []RouteShell{{Pattern: "/public", File: "public/index.html", RouteID: "/public", Segments: []Segment{{Kind: "static", Value: "public"}}}},
	}
	preloads := []Preload{
		{ID: "public", Variables: map[string]VariableBinding{}},
		{ID: "private", Authenticated: true, Variables: map[string]VariableBinding{}},
	}
	enabled, disabled := true, false
	for _, test := range []struct {
		name                    string
		authenticated, fallback *bool
		preloads                bool
		wantHTML                string
		wantQueries             []string
	}{
		{name: "absent auth serves matched data page", preloads: true, wantHTML: "Public data page", wantQueries: []string{"public"}},
		{name: "false auth serves matched data page", authenticated: &disabled, preloads: true, wantHTML: "Public data page", wantQueries: []string{"public"}},
		{name: "private queries use auth", authenticated: &enabled, preloads: true, wantHTML: "Public data page", wantQueries: []string{"public", "private"}},
		{name: "explicit fallback with public queries", authenticated: &disabled, fallback: &enabled, preloads: true, wantHTML: "Generic fallback", wantQueries: []string{"public"}},
		{name: "fallback preserves authenticated queries", authenticated: &enabled, fallback: &enabled, preloads: true, wantHTML: "Generic fallback", wantQueries: []string{"public", "private"}},
		{name: "explicit matched document", authenticated: &disabled, fallback: &disabled, preloads: true, wantHTML: "Public data page", wantQueries: []string{"public"}},
		{name: "static matched document", wantHTML: "Public data page"},
		{name: "static fallback document", fallback: &enabled, wantHTML: "Generic fallback"},
	} {
		t.Run(test.name, func(t *testing.T) {
			files := frontendFiles(t, manifest)
			declarations := []Preload{}
			if test.preloads {
				declarations = preloads
			}
			files["public/index.html"] = &fstest.MapFile{Data: []byte(preloadMetadataHTML(t, "Public data page", declarations))}
			var queries []string
			options := Options{
				IsQuery: func(string) bool { return true },
				Execute: func(_ *http.Request, id string, _ map[string]any) any {
					queries = append(queries, id)
					return map[string]any{"data": map[string]any{"id": id}}
				},
			}
			if test.authenticated != nil {
				options.Authenticated = func(*http.Request) bool { return *test.authenticated }
			}
			if test.fallback != nil {
				options.UseFallback = func(*http.Request) bool { return *test.fallback }
			}
			handler, err := Frontend(files, options)
			if err != nil {
				t.Fatal(err)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/public", nil))
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "<main>"+test.wantHTML+"</main>") || !reflect.DeepEqual(queries, test.wantQueries) {
				t.Fatalf("document or query policy changed: HTTP %d, queries %v, HTML %s", response.Code, queries, response.Body.String())
			}
		})
	}
}

func TestFrontendAssetsAndNamespaces(t *testing.T) {
	handler, err := Frontend(frontendFiles(t, frontendManifest()), Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path  string
		body  string
		cache string
	}{
		{"/assets/app-abcd1234.js", "console.log('asset')", "public, max-age=31536000, immutable"},
		{"/favicon.svg", "<svg></svg>", "public, max-age=3600"},
		{"/LICENSE", "An exact extensionless asset", "public, max-age=3600"},
		{"/projects/index.html", preloadMetadataHTML(t, "Projects list", []Preload{}), "no-cache"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if response.Code != http.StatusOK || response.Body.String() != tc.body || response.Header().Get("Cache-Control") != tc.cache {
				t.Fatalf("wrong asset response: %d %q %v", response.Code, response.Body.String(), response.Header())
			}
		})
	}
	for _, target := range []string{
		"/api", "/api/unknown", "/api/private.json", "/auth", "/auth/secret",
		"/graphql", "/graphql/unknown", "/healthz", "/healthz/unknown",
		"/assets", "/assets/missing", "/assets/missing.js",
		"/unmatched/missing.js", "/unmatched/missing.css", "/unmatched/favicon.ico", "/projects/release.v1/history.json",
		"/_routes", "/_routes/missing", "/_shell.html/missing", "/route-shells.json/missing",
	} {
		t.Run(target, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
			if response.Code != http.StatusNotFound {
				t.Fatalf("protected or missing resource returned %d: %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestFrontendHEADAndCanonicalURLs(t *testing.T) {
	handler, err := Frontend(frontendFiles(t, frontendManifest()), Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"/", "/projects", "/projects/QWxwaGE", "/projects/release.v1", "/docs/file.json", "/unmatched/nested", "/assets/app-abcd1234.js"} {
		t.Run("HEAD "+target, func(t *testing.T) {
			get := httptest.NewRecorder()
			handler.ServeHTTP(get, httptest.NewRequest(http.MethodGet, target, nil))
			head := httptest.NewRecorder()
			handler.ServeHTTP(head, httptest.NewRequest(http.MethodHead, target, nil))
			if head.Code != http.StatusOK || head.Body.Len() != 0 {
				t.Fatalf("HEAD returned %d with %d body bytes", head.Code, head.Body.Len())
			}
			for _, key := range []string{"Content-Type", "Content-Length", "Cache-Control"} {
				if head.Header().Get(key) != get.Header().Get(key) {
					t.Fatalf("HEAD %s differs from GET: %v / %v", key, head.Header(), get.Header())
				}
			}
		})
	}
	for _, tc := range []struct{ target, location string }{
		{"/projects/", "/projects"},
		{"/projects/QWxwaGE/?tab=activity", "/projects/QWxwaGE?tab=activity"},
		{"/projects/alpha%2Fbeta/", "/projects/alpha%2Fbeta"},
		{"/projects//QWxwaGE", "/projects/QWxwaGE"},
		{"//example.com/", "/example.com"},
	} {
		t.Run(tc.target, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.target, nil))
			if response.Code != http.StatusPermanentRedirect || response.Header().Get("Location") != tc.location {
				t.Fatalf("wrong canonical redirect: %d %q", response.Code, response.Header().Get("Location"))
			}
		})
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/projects", nil))
	if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("unexpected POST response: %d %v", response.Code, response.Header())
	}
}

func TestFrontendManifestValidation(t *testing.T) {
	valid := frontendManifest()
	for _, tc := range []struct {
		name string
		data string
	}{
		{"invalid JSON", "{"},
		{"trailing JSON", `{"version":3,"fallback":"_shell.html"} {}`},
		{"unknown field", `{"version":3,"fallback":"_shell.html","typo":true}`},
		{"missing version", `{"fallback":"_shell.html"}`},
		{"legacy version", `{"version":1,"fallback":"_shell.html"}`},
		{"unsupported version", `{"version":4,"fallback":"_shell.html"}`},
		{"missing fallback", `{"version":3}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			files := frontendFiles(t, valid)
			files["route-shells.json"].Data = []byte(tc.data)
			if _, err := Frontend(files, Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}}); err == nil {
				t.Fatal("invalid manifest was accepted")
			}
		})
	}
	for _, target := range []string{"../_shell.html", "/_shell.html", "dir/../_shell.html", "dir\\shell.html", "shell%2ehtml", "favicon.svg", "missing.html"} {
		t.Run("fallback "+target, func(t *testing.T) {
			manifest := frontendManifest()
			manifest.Fallback = target
			if _, err := Frontend(frontendFiles(t, manifest), Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}}); err == nil {
				t.Fatal("invalid fallback target was accepted")
			}
		})
	}
	for _, target := range []string{"../_shell.html", "/_shell.html", "missing.html", "favicon.svg"} {
		t.Run("route target "+target, func(t *testing.T) {
			manifest := frontendManifest()
			manifest.Routes[1].File = target
			if _, err := Frontend(frontendFiles(t, manifest), Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}}); err == nil {
				t.Fatal("invalid route target was accepted")
			}
		})
	}
	for _, pattern := range []string{
		"", "projects", "GET /projects", "/projects//$id", "/projects/../other",
		"/projects?query=1", "/api", "/auth/$id", "/graphql", "/healthz",
		"/assets/$asset", "/_routes/$file", "/_shell.html", "/route-shells.json",
	} {
		t.Run("pattern "+pattern, func(t *testing.T) {
			manifest := frontendManifest()
			manifest.Routes = []RouteShell{{Pattern: pattern, File: "_shell.html", RouteID: "invalid", Segments: []Segment{}}}
			if _, err := Frontend(frontendFiles(t, manifest), Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}}); err == nil {
				t.Fatal("unsupported route pattern was accepted")
			}
		})
	}
	t.Run("duplicate shape", func(t *testing.T) {
		manifest := frontendManifest()
		duplicate := manifest.Routes[2]
		duplicate.Pattern = "/projects/$other"
		duplicate.RouteID = "other"
		duplicate.Segments = []Segment{{Kind: "static", Value: "projects"}, {Kind: "param", Name: "other"}}
		manifest.Routes = append(manifest.Routes, duplicate)
		if _, err := Frontend(frontendFiles(t, manifest), Options{}); err == nil {
			t.Fatal("duplicate shape accepted")
		}
	})
	for _, segments := range [][]Segment{
		nil,
		{{Kind: "unknown"}},
		{{Kind: "static", Value: ""}},
		{{Kind: "static", Value: "a/b"}},
		{{Kind: "static", Value: "a", Name: "id"}},
		{{Kind: "param", Name: ""}},
		{{Kind: "param", Name: "id", Prefix: "a/"}},
		{{Kind: "param", Name: "id", Suffix: "/b"}},
		{{Kind: "param", Name: "id"}, {Kind: "optional", Name: "id"}},
		{{Kind: "splat", Name: "other"}},
		{{Kind: "splat", Name: "_splat"}, {Kind: "static", Value: "after"}},
	} {
		manifest := frontendManifest()
		manifest.Routes[2].Segments = segments
		if _, err := Frontend(frontendFiles(t, manifest), Options{}); err == nil {
			t.Fatalf("invalid segments accepted: %#v", segments)
		}
	}
	t.Run("empty target", func(t *testing.T) {
		files := frontendFiles(t, valid)
		files["_routes/project-detail.html"].Data = nil
		if _, err := Frontend(files, Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}}); err == nil {
			t.Fatal("empty route HTML was accepted")
		}
	})
}

func TestFrontendRequiresManifest(t *testing.T) {
	for _, tc := range []struct {
		name  string
		files fstest.MapFS
	}{
		{"SPA shell", fstest.MapFS{"_shell.html": {Data: []byte("SPA shell")}}},
		{"legacy index", fstest.MapFS{"index.html": {Data: []byte("Legacy index")}}},
		{"both shells", fstest.MapFS{"_shell.html": {Data: []byte("SPA shell")}, "index.html": {Data: []byte("Prerendered root")}}},
		{"empty frontend", fstest.MapFS{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Frontend(tc.files, Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}}); err == nil || !strings.Contains(err.Error(), "read frontend route manifest") {
				t.Fatalf("frontend without its route manifest should fail startup: %v", err)
			}
		})
	}
}

// The TypeScript test supplies expectations from the installed native router.
// Run this same HTTP entry point for every adapter manifest and escaped URL.
func TestFrontendRouteParity(t *testing.T) {
	name := os.Getenv("ACME_ROUTE_PARITY_CORPUS")
	if name == "" {
		t.Skip("native router corpus is supplied by the TypeScript parity test")
	}
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []struct {
			Manifest Manifest `json:"manifest"`
			Requests []struct {
				Path     string            `json:"path"`
				RouteID  *string           `json:"routeId"`
				Params   map[string]string `json:"params"`
				Status   int               `json:"status"`
				Location string            `json:"location"`
			} `json:"requests"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) == 0 {
		t.Fatal("native route corpus must contain cases")
	}
	for _, entry := range corpus.Cases {
		files := frontendFiles(t, entry.Manifest)
		for _, route := range entry.Manifest.Routes {
			files[route.File] = &fstest.MapFile{Data: []byte(preloadMetadataHTML(t, route.RouteID, []Preload{{ID: route.RouteID, Variables: map[string]VariableBinding{}}}))}
		}
		handler, err := Frontend(files, Options{
			Authenticated: func(*http.Request) bool { return true },
			IsQuery:       func(string) bool { return true },
			Execute: func(r *http.Request, id string, _ map[string]any) any {
				return struct {
					RouteID string            `json:"routeId"`
					Params  map[string]string `json:"params"`
				}{id, pathParams(r)}
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		for _, request := range entry.Requests {
			t.Run(request.Path, func(t *testing.T) {
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, request.Path, nil))
				status := request.Status
				if status == 0 {
					status = http.StatusOK
				}
				if response.Code != status || response.Header().Get("Location") != request.Location {
					t.Fatalf("HTTP result got %d %q, want %d %q", response.Code, response.Header().Get("Location"), status, request.Location)
				}
				var actual struct {
					RouteID *string           `json:"routeId"`
					Params  map[string]string `json:"params"`
				}
				actual.Params = map[string]string{}
				if status == http.StatusOK {
					_, rest, _ := strings.Cut(response.Body.String(), strings.TrimSuffix(bootstrapSlot, "[]</script>"))
					payload, _, _ := strings.Cut(rest, "</script>")
					var entries []struct {
						Response json.RawMessage `json:"response"`
					}
					if err := json.Unmarshal([]byte(payload), &entries); err != nil {
						t.Fatalf("bootstrap payload %q: %v", payload, err)
					}
					if len(entries) > 0 {
						if err := json.Unmarshal(entries[0].Response, &actual); err != nil {
							t.Fatal(err)
						}
					}
				}
				if !reflect.DeepEqual(actual.RouteID, request.RouteID) || !reflect.DeepEqual(actual.Params, request.Params) {
					t.Fatalf("native parity got %#v %#v, want %#v %#v", actual.RouteID, actual.Params, request.RouteID, request.Params)
				}
			})
		}
	}
}
