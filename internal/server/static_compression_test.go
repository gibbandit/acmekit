package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFrontendCompressionLeavesPrivateHTMLAndAPIUnchanged(t *testing.T) {
	app, err := newServer(Config{Operations: []byte(`{"workspace":"query { viewer { id } serverInfo { name } }"}`)}, bootstrapFiles(t, []pagePreload{{ID: "workspace", Variables: map[string]variableBinding{}}}))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		method, target, body, cache string
	}{
		{http.MethodGet, "/projects/example", "", "private, no-store"},
		{http.MethodPost, "/graphql", `{"query":"{ serverInfo { name } }"}`, "no-store"},
	} {
		request := httptest.NewRequest(tc.method, tc.target, strings.NewReader(tc.body))
		request.Header.Set("Accept-Encoding", "gzip")
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		app.handler().ServeHTTP(response, request)
		if response.Code != http.StatusOK || response.Header().Get("Content-Encoding") != "" || response.Header().Get("Cache-Control") != tc.cache {
			t.Fatalf("private response changed: %d %v %s", response.Code, response.Header(), response.Body.String())
		}
		if tc.method == http.MethodGet && !strings.Contains(response.Body.String(), bootstrapSlot[:len(bootstrapSlot)-len("[]</script>")]) {
			t.Fatal("private HTML lost its bootstrap data")
		}
		if tc.method == http.MethodPost {
			var result graphResult
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			noErrors(t, result)
		}
	}
}
