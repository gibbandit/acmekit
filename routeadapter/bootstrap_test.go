package routeadapter

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
)

func TestBootstrapKeepsEncodableResponses(t *testing.T) {
	for _, test := range []struct {
		name  string
		valid bool
	}{
		{name: "one response can be recovered over HTTP", valid: true},
		{name: "all responses can be recovered over HTTP"},
	} {
		t.Run(test.name, func(t *testing.T) {
			content := []byte("<main>Loading</main>" + bootstrapSlot)
			metadata := preloadMetadata{Preloads: []Preload{
				{ID: "missing", Variables: map[string]VariableBinding{}},
				{ID: "other", Variables: map[string]VariableBinding{}},
			}}
			handler, err := bootstrapPage(RouteShell{File: "index.html"}, content, metadata, Options{
				IsQuery: func(string) bool { return true },
				Execute: func(_ *http.Request, id string, _ map[string]any) any {
					if test.valid && id == "other" {
						return map[string]any{"data": map[string]any{"name": "</script>"}}
					}
					return map[string]any{"data": map[string]any{"value": math.NaN()}}
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
			if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatalf("expected private HTML, got %d %v", response.Code, response.Header())
			}
			body := response.Body.String()
			if !test.valid {
				if body != string(content) {
					t.Fatalf("expected unchanged HTML, got %s", body)
				}
				return
			}
			start := strings.TrimSuffix(string(content), "[]</script>")
			payload := strings.TrimSuffix(strings.TrimPrefix(body, start), "</script>")
			var entries []bootstrapEntry
			if err := json.Unmarshal([]byte(payload), &entries); err != nil || len(entries) != 1 || entries[0].ID != "other" {
				t.Fatalf("expected one encodable response, got %s (%v)", payload, err)
			}
			if !strings.Contains(payload, `\u003c/script\u003e`) {
				t.Fatalf("missing HTML escaping in %s", payload)
			}
		})
	}
}

func TestPreloadQueryMatchesURLSearchParams(t *testing.T) {
	for _, tc := range []struct {
		query string
		want  url.Values
	}{
		{"search=a;b", url.Values{"search": {"a;b"}}},
		{"search=a%3Bb", url.Values{"search": {"a;b"}}},
		{"keep=%zz;a&search=portal", url.Values{"keep": {"%zz;a"}, "search": {"portal"}}},
		{"search=%zz&search=second", url.Values{"search": {"%zz", "second"}}},
		{"search=%&search=%2", url.Values{"search": {"%", "%2"}}},
		{"search=one+two%2Bthree%25", url.Values{"search": {"one two+three%"}}},
		{"search=caf%C3%A9%F0%9F%98%80", url.Values{"search": {"café😀"}}},
		{"search=%E0%A4", url.Values{"search": {"\uFFFD"}}},
		{"search=%E1%80%E1%80", url.Values{"search": {"\uFFFD\uFFFD"}}},
		{"search=%ED%A0%80", url.Values{"search": {"\uFFFD\uFFFD\uFFFD"}}},
		{"search=%F4%90%80%80", url.Values{"search": {"\uFFFD\uFFFD\uFFFD\uFFFD"}}},
		{"%E0%A4=first&%EF%BF%BD=second", url.Values{"\uFFFD": {"first", "second"}}},
		{"%73earch=first&search=second&keep=%zz;a", url.Values{"search": {"first", "second"}, "keep": {"%zz;a"}}},
		{"=empty&&flag&search=a=b&search=second", url.Values{"": {"empty"}, "flag": {""}, "search": {"a=b", "second"}}},
		{"search=%EF%BB%BFvalue", url.Values{"search": {"\uFEFFvalue"}}},
		{"", url.Values{}},
	} {
		t.Run(tc.query, func(t *testing.T) {
			if got := parsePreloadQuery(tc.query); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("query decoding: got %#v; want %#v", got, tc.want)
			}
		})
	}
}

func TestPreloadVariableBindings(t *testing.T) {
	pathName, minimum, maximum := "projectId", 1.0, 50.0
	bindings := map[string]VariableBinding{
		"id":      {Source: "path", Name: &pathName},
		"search":  {Source: "query"},
		"first":   {Source: "query", Type: "int", Default: 6, Min: &minimum, Max: &maximum},
		"status":  {Source: "query", Values: []string{"ACTIVE", "PLANNED"}},
		"enabled": {Source: "query", Type: "boolean"},
		"after":   {Source: "query"},
		"literal": {Source: "literal", Value: false},
	}
	request := httptest.NewRequest(http.MethodGet, "/projects/id?search=+Acme+&search=ignored&first=2&status=ACTIVE&enabled=false", nil)
	request = request.WithContext(withPathParams(request.Context(), map[string]string{"projectId": "  original ID  "}))
	got, err := resolvePreloadVariables(bindings, request)
	want := map[string]any{"id": "  original ID  ", "search": "Acme", "first": 2, "status": "ACTIVE", "enabled": false, "after": nil, "literal": false}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("bindings: got %#v, %v; want %#v", got, err, want)
	}
	request.URL.RawQuery = "first=+&search="
	got, err = resolvePreloadVariables(bindings, request)
	if err != nil || got["first"] != 6 || got["search"] != nil || got["status"] != nil {
		t.Fatalf("empty values should use default/null: %#v, %v", got, err)
	}
	for encoded, expected := range map[string]string{"%EF%BB%BFAPI": "API", "%C2%85API": "\u0085API"} {
		request.URL.RawQuery = "search=" + encoded
		got, err = resolvePreloadVariables(bindings, request)
		if err != nil || got["search"] != expected {
			t.Fatalf("query trim differs from JavaScript: %#v, %v", got, err)
		}
	}
	for _, query := range []string{"first=01", "first=2147483648", "first=51", "first=-1", "enabled=1", "status=DELETED", "first=%zz", "first=1;first=2", "first=%E0%A4"} {
		t.Run(query, func(t *testing.T) {
			request.URL.RawQuery = query
			if _, err := resolvePreloadVariables(bindings, request); err == nil {
				t.Fatal("invalid binding accepted")
			} else if strings.HasPrefix(query, "first=") && err.Error() != "Invalid value for first." {
				t.Fatalf("invalid integer bypassed binding validation: %v", err)
			}
		})
	}
}
