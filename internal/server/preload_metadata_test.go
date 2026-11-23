package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/gibbandit/acmekit/routeadapter"
)

func preloadMetadataHTML(t *testing.T, body string, preloads []pagePreload) string {
	t.Helper()
	payload, err := json.Marshal(preloadMetadata{Version: 1, Preloads: preloads})
	if err != nil {
		t.Fatal(err)
	}
	return `<!doctype html><main>` + body + `</main>` + preloadMetadataPrefix + string(payload) + `</script>` + bootstrapSlot
}

func TestFrontendMetadataValidationAtStartup(t *testing.T) {
	operations, err := loadOperations([]byte(`{"query":"query { viewer { id } }","mutation":"mutation { deleteProject(input:{id:\"x\"}) { deletedProjectId } }"}`))
	if err != nil {
		t.Fatal(err)
	}
	app := &server{operations: operations}
	query := []pagePreload{{ID: "query", Variables: map[string]variableBinding{}}}
	publicHTML := preloadMetadataHTML(t, "Sign in", []pagePreload{})
	workspaceHTML := preloadMetadataHTML(t, "Workspace", query)
	for _, tc := range []struct {
		name, html, fallback, legacyPreload, want string
	}{
		{name: "missing route metadata", html: bootstrapHTML, want: "exactly one preload metadata"},
		{name: "duplicate route metadata", html: workspaceHTML + workspaceHTML, want: "exactly one preload metadata"},
		{name: "missing fallback metadata", fallback: bootstrapHTML, want: "exactly one preload metadata"},
		{name: "fallback declarations", fallback: workspaceHTML, want: "fallback metadata must not declare preloads"},
		{name: "unknown operation", html: preloadMetadataHTML(t, "Workspace", []pagePreload{{ID: "missing", Variables: map[string]variableBinding{}}}), want: "unknown or non-query operation"},
		{name: "mutation operation", html: preloadMetadataHTML(t, "Workspace", []pagePreload{{ID: "mutation", Variables: map[string]variableBinding{}}}), want: "unknown or non-query operation"},
		{name: "legacy null", legacyPreload: "null", want: `unknown field "preload"`},
		{name: "legacy empty array", legacyPreload: "[]", want: `unknown field "preload"`},
		{name: "legacy declaration", legacyPreload: `[{"id":"query","variables":{}}]`, want: `unknown field "preload"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manifest := routeShellManifest{
				Version: 3, Fallback: "_shell.html",
				Routes: []routeShell{{Pattern: "/", File: "index.html", RouteID: "/_app/", Segments: []routeadapter.Segment{}}},
			}
			files := frontendFiles(t, manifest)
			files["_shell.html"].Data = []byte(publicHTML)
			files["index.html"].Data = []byte(workspaceHTML)
			if tc.html != "" {
				files["index.html"].Data = []byte(tc.html)
			}
			if tc.fallback != "" {
				files["_shell.html"].Data = []byte(tc.fallback)
			}
			if tc.legacyPreload != "" {
				files["route-shells.json"].Data = []byte(`{"version":3,"fallback":"_shell.html","routes":[{"pattern":"/{$}","file":"index.html","routeId":"/_app/","preload":` + tc.legacyPreload + `}]}`)
			}
			if _, err := routeadapter.Frontend(files, app.routeAdapterOptions()); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("invalid build should fail startup with %q: %v", tc.want, err)
			}
		})
	}
}
