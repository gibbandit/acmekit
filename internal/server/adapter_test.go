package server

import (
	"encoding/json"
	"testing"
	"testing/fstest"

	"github.com/gibbandit/acmekit/routeadapter"
)

type pagePreload = routeadapter.Preload
type variableBinding = routeadapter.VariableBinding
type routeShell = routeadapter.RouteShell
type routeShellManifest = routeadapter.Manifest
type preloadMetadata struct {
	Version  int           `json:"version"`
	Preloads []pagePreload `json:"preloads"`
}

const preloadMetadataPrefix = `<script id="route-preloads" type="application/json">`
const bootstrapSlot = `<script id="route-bootstrap" type="application/json">[]</script>`

func frontendFiles(t *testing.T, manifest routeShellManifest) fstest.MapFS {
	t.Helper()
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return fstest.MapFS{
		"route-shells.json":           {Data: data},
		"_shell.html":                 {Data: []byte(preloadMetadataHTML(t, "Generic fallback", []pagePreload{}))},
		"index.html":                  {Data: []byte(preloadMetadataHTML(t, "Overview", []pagePreload{}))},
		"_routes/project-detail.html": {Data: []byte(preloadMetadataHTML(t, "Project details", []pagePreload{}))},
	}
}
