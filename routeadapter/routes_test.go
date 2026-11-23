package routeadapter

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestNativeRouteSegmentsAndPrecedence(t *testing.T) {
	root := &routeNode{}
	routes := []RouteShell{
		{Pattern: "/{-$lang}/a/$x", RouteID: "optional-first", Segments: []Segment{{Kind: "optional", Name: "lang"}, {Kind: "static", Value: "a"}, {Kind: "param", Name: "x"}}},
		{Pattern: "/$x/a/{-$rest}", RouteID: "required-first", Segments: []Segment{{Kind: "param", Name: "x"}, {Kind: "static", Value: "a"}, {Kind: "optional", Name: "rest"}}},
		{Pattern: "/files/$", RouteID: "splat", Segments: []Segment{{Kind: "static", Value: "files"}, {Kind: "splat", Name: "_splat"}}},
		{Pattern: "/files/new", RouteID: "fixed", Segments: []Segment{{Kind: "static", Value: "files"}, {Kind: "static", Value: "new"}}},
		{Pattern: "/files/prefix-{$id}.json", RouteID: "affixed", Segments: []Segment{{Kind: "static", Value: "files"}, {Kind: "param", Name: "id", Prefix: "prefix-", Suffix: ".json"}}},
		{Pattern: "/optional/pre-{-$id}-end", RouteID: "optional-affixed", Segments: []Segment{{Kind: "static", Value: "optional"}, {Kind: "optional", Name: "id", Prefix: "pre-", Suffix: "-end"}}},
		{Pattern: "/wild/pre-{$}.txt", RouteID: "splat-affixed", Segments: []Segment{{Kind: "static", Value: "wild"}, {Kind: "splat", Name: "_splat", Prefix: "pre-", Suffix: ".txt"}}},
		{Pattern: "/nested/{$}/end", RouteID: "splat-suffix", Segments: []Segment{{Kind: "static", Value: "nested"}, {Kind: "splat", Name: "_splat", Suffix: "/end"}}},
		{Pattern: "/index/{-$id}", RouteID: "optional-index", Segments: []Segment{{Kind: "static", Value: "index"}, {Kind: "optional", Name: "id"}}},
		{Pattern: "/index/", RouteID: "index", Segments: []Segment{{Kind: "static", Value: "index"}}},
		{Pattern: "/parent/$id/settings", RouteID: "later-static", Segments: []Segment{{Kind: "static", Value: "parent"}, {Kind: "param", Name: "id"}, {Kind: "static", Value: "settings"}}},
		{Pattern: "/parent/current/$tab", RouteID: "earlier-static", Segments: []Segment{{Kind: "static", Value: "parent"}, {Kind: "static", Value: "current"}, {Kind: "param", Name: "tab"}}},
	}
	for _, route := range routes {
		if err := root.add(route, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})); err != nil {
			t.Fatal(err)
		}
	}
	root.sort()
	for _, test := range []struct {
		path, id string
		params   map[string]string
	}{
		{"/a/a", "optional-first", map[string]string{"x": "a"}},
		{"/a/a/a", "required-first", map[string]string{"x": "a", "rest": "a"}},
		{"/files", "splat", map[string]string{"_splat": "", "*": ""}},
		{"/files/a/b", "splat", map[string]string{"_splat": "a/b", "*": "a/b"}},
		{"/files/new", "fixed", map[string]string{}},
		{"/files/prefix-.json", "affixed", map[string]string{"id": ""}},
		{"/files/prefix-%2F.json", "affixed", map[string]string{"id": "/"}},
		{"/optional", "optional-affixed", map[string]string{}},
		{"/optional/pre--end", "optional-affixed", map[string]string{}},
		{"/optional/pre-value-end", "optional-affixed", map[string]string{"id": "value"}},
		{"/wild/pre-.txt", "splat-affixed", map[string]string{"_splat": "", "*": ""}},
		{"/wild/pre-a/b.txt", "splat-affixed", map[string]string{"_splat": "a/b", "*": "a/b"}},
		{"/nested/a/b/end", "splat-suffix", map[string]string{"_splat": "a/b", "*": "a/b"}},
		{"/index", "index", map[string]string{}},
		{"/parent/current/settings", "earlier-static", map[string]string{"tab": "settings"}},
		{"/files/%252F", "splat", map[string]string{"_splat": "%2F", "*": "%2F"}},
		{"/files/%C3%A9", "splat", map[string]string{"_splat": "é", "*": "é"}},
		{"/files/plus+sign", "splat", map[string]string{"_splat": "plus+sign", "*": "plus+sign"}},
	} {
		t.Run(test.path, func(t *testing.T) {
			match := root.match(decodeFrontendPath(test.path))
			if match == nil || match.route.RouteID != test.id || !reflect.DeepEqual(match.params, test.params) {
				t.Fatalf("got %#v, want %s %#v", match, test.id, test.params)
			}
		})
	}
	for _, path := range []string{"/files/%FF", "/files/%C0%AF", "/files/%E0%A4", "/files/%zz"} {
		if match := root.match(decodeFrontendPath(path)); match != nil {
			t.Fatalf("malformed path decoded: %s %#v", path, match.params)
		}
	}
}

func TestPreloadPathPresence(t *testing.T) {
	bindings := map[string]VariableBinding{"id": {Source: "path", Default: "default"}}
	for _, test := range []struct {
		params map[string]string
		want   any
	}{
		{map[string]string{}, "default"},
		{map[string]string{"id": ""}, ""},
		{map[string]string{"id": " value "}, " value "},
	} {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.SetPathValue("id", "unmatched value")
		request = request.WithContext(withPathParams(request.Context(), test.params))
		variables, err := resolvePreloadVariables(bindings, request)
		if err != nil || variables["id"] != test.want {
			t.Fatalf("presence got %#v %v, want %#v", variables, err, test.want)
		}
	}
}

func TestBootstrapRejectsUndeclaredPathParameter(t *testing.T) {
	metadata := preloadMetadata{Preloads: []Preload{{ID: "query", Variables: map[string]VariableBinding{"id": {Source: "path"}}}}}
	_, err := bootstrapPage(RouteShell{Pattern: "/$other", File: "index.html", Segments: []Segment{{Kind: "param", Name: "other"}}}, []byte(bootstrapSlot), metadata, Options{IsQuery: func(string) bool { return true }})
	if err == nil || !strings.Contains(err.Error(), "unknown path parameter") {
		t.Fatalf("missing path parameter accepted: %v", err)
	}
}
