package server

import (
	"testing"
)

func TestFrontendManifestErrorsReachServerStartup(t *testing.T) {
	files := bootstrapFiles(t, []pagePreload{})
	files["route-shells.json"].Data = []byte(`{"version":99,"fallback":"_shell.html"}`)
	if _, err := New(Config{}, files); err == nil {
		t.Fatal("server started with an incompatible frontend manifest")
	}
}
