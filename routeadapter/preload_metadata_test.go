package routeadapter

import (
	"encoding/json"
	"testing"
)

func preloadMetadataHTML(t *testing.T, body string, preloads []Preload) string {
	t.Helper()
	payload, err := json.Marshal(preloadMetadata{Version: 1, Preloads: preloads})
	if err != nil {
		t.Fatal(err)
	}
	return `<!doctype html><main>` + body + `</main>` + preloadMetadataPrefix + string(payload) + `</script>` + bootstrapSlot
}

func TestReadPreloadMetadata(t *testing.T) {
	for _, preloads := range [][]Preload{
		{},
		{{ID: "query", Variables: map[string]VariableBinding{
			"label": {Source: "literal", Value: `</script><script>alert("test")</script>`},
		}}},
	} {
		html := preloadMetadataHTML(t, "Public loading layout", preloads)
		got, err := readPreloadMetadata([]byte(html))
		if err != nil || len(got.Preloads) != len(preloads) || got.PreloadTimeoutMs != 0 {
			t.Fatalf("metadata did not round-trip: %+v (%v)", got, err)
		}
		if len(got.Preloads) != 0 && got.Preloads[0].Variables["label"].Value != preloads[0].Variables["label"].Value {
			t.Fatalf("HTML-safe JSON changed the literal binding: %+v", got)
		}
	}
}

func TestReadPreloadMetadataTimeout(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  uint32
	}{
		{"0", 0},
		{"750", 750},
		{"4294967295", 4294967295},
	} {
		payload := preloadMetadataPrefix + `{"version":1,"preloadTimeoutMs":` + tc.value + `,"preloads":[]}</script>`
		metadata, err := readPreloadMetadata([]byte(payload))
		if err != nil || metadata.PreloadTimeoutMs != tc.want {
			t.Fatalf("preloadTimeoutMs %s decoded to %d (%v)", tc.value, metadata.PreloadTimeoutMs, err)
		}
	}
}

func TestReadPreloadMetadataRejectsInvalidDeclarations(t *testing.T) {
	valid := preloadMetadataPrefix + `{"version":1,"preloads":[]}</script>`
	for _, tc := range []struct{ name, payload string }{
		{"invalid JSON", `{`},
		{"trailing JSON", `{"version":1,"preloads":[]} {}`},
		{"unknown field", `{"version":1,"preloads":[],"typo":true}`},
		{"unsupported version", `{"version":2,"preloads":[]}`},
		{"missing version", `{"preloads":[]}`},
		{"missing preloads", `{"version":1}`},
		{"null preloads", `{"version":1,"preloads":null}`},
		{"non-array preloads", `{"version":1,"preloads":{}}`},
		{"negative timeout", `{"version":1,"preloads":[],"preloadTimeoutMs":-1}`},
		{"fractional timeout", `{"version":1,"preloads":[],"preloadTimeoutMs":0.75}`},
		{"out of range timeout", `{"version":1,"preloads":[],"preloadTimeoutMs":4294967296}`},
		{"unknown preload field", `{"version":1,"preloads":[{"id":"query","variables":{},"typo":true}]}`},
		{"missing variables", `{"version":1,"preloads":[{"id":"query"}]}`},
		{"null variables", `{"version":1,"preloads":[{"id":"query","variables":null}]}`},
		{"non-object variables", `{"version":1,"preloads":[{"id":"query","variables":[]}]}`},
		{"unknown binding field", `{"version":1,"preloads":[{"id":"query","variables":{"id":{"source":"path","typo":true}}}]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := readPreloadMetadata([]byte(preloadMetadataPrefix + tc.payload + `</script>`)); err == nil {
				t.Fatal("invalid metadata was accepted")
			}
		})
	}
	for _, tc := range []struct{ name, html string }{
		{"missing script", `<main>Loading</main>`},
		{"duplicate script", valid + valid},
		{"unclosed script", preloadMetadataPrefix + `{"version":1,"preloads":[]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := readPreloadMetadata([]byte(tc.html)); err == nil {
				t.Fatal("invalid metadata slot was accepted")
			}
		})
	}
}
