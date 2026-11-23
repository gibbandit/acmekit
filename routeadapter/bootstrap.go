package routeadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"

	textunicode "golang.org/x/text/encoding/unicode"
)

const bootstrapSlot = `<script id="route-bootstrap" type="application/json">[]</script>`

// Preload describes one query and its URL-derived variables in a page's metadata.
type Preload struct {
	ID            string                     `json:"id"`
	Authenticated bool                       `json:"authenticated,omitempty"`
	Variables     map[string]VariableBinding `json:"variables"`
}

// VariableBinding declares a path, query, or literal input with optional coercion.
type VariableBinding struct {
	Source  string   `json:"source"`
	Name    *string  `json:"name,omitempty"`
	Type    string   `json:"type,omitempty"`
	Value   any      `json:"value,omitempty"`
	Default any      `json:"default,omitempty"`
	Values  []string `json:"values,omitempty"`
	Min     *float64 `json:"min,omitempty"`
	Max     *float64 `json:"max,omitempty"`
}

type bootstrapEntry struct {
	ID        string         `json:"id"`
	Variables map[string]any `json:"variables"`
	Response  any            `json:"response"`
}

var decimalInt = regexp.MustCompile(`^-?(0|[1-9][0-9]*)$`)
var queryPercentEncoding = regexp.MustCompile(`%[0-9A-Fa-f]{2}|%`)

// Preserve URLSearchParams' field order and forgiving form-query decoding.
func parsePreloadQuery(rawQuery string) url.Values {
	values := make(url.Values)
	for field := range strings.SplitSeq(rawQuery, "&") {
		if field == "" {
			continue
		}
		name, value, _ := strings.Cut(field, "=")
		values.Add(decodeQueryComponent(name), decodeQueryComponent(value))
	}
	return values
}

func decodeQueryComponent(raw string) string {
	repaired := queryPercentEncoding.ReplaceAllStringFunc(raw, func(escape string) string {
		if escape == "%" {
			return "%25"
		}
		return escape
	})
	// Repair makes every percent triplet valid, so QueryUnescape cannot fail.
	decoded, _ := url.QueryUnescape(repaired)
	// UTF8 replaces malformed subsequences using W3C maximal subparts and completes at EOF.
	decoded, _ = textunicode.UTF8.NewDecoder().String(decoded)
	return decoded
}

// Bind only the declared values. Defaults and literals are trusted build data;
// incoming query values use the same coercion rules as the TypeScript client.
func resolvePreloadVariables(bindings map[string]VariableBinding, r *http.Request) (map[string]any, error) {
	variables := make(map[string]any, len(bindings))
	search := parsePreloadQuery(r.URL.RawQuery)
	for variable, binding := range bindings {
		if binding.Source == "literal" {
			variables[variable] = binding.Value
			continue
		}
		name := variable
		if binding.Name != nil {
			name = *binding.Name
		}
		raw, present := pathParams(r)[name]
		if binding.Source == "query" {
			// Match JavaScript trim: BOM is whitespace, but NEL is not.
			raw = strings.TrimFunc(search.Get(name), func(r rune) bool {
				return r == '\uFEFF' || (r != '\u0085' && unicode.IsSpace(r))
			})
			present = raw != ""
		}
		if !present {
			variables[variable] = binding.Default
			continue
		}
		var value any = raw
		invalid := func() (map[string]any, error) {
			return nil, fmt.Errorf("Invalid value for %s.", variable)
		}
		switch binding.Type {
		case "int":
			number, err := strconv.ParseInt(raw, 10, 32)
			if !decimalInt.MatchString(raw) || err != nil ||
				(binding.Min != nil && float64(number) < *binding.Min) ||
				(binding.Max != nil && float64(number) > *binding.Max) {
				return invalid()
			}
			value = int(number)
		case "boolean":
			if raw != "true" && raw != "false" {
				return invalid()
			}
			value = raw == "true"
		}
		if binding.Values != nil && !slices.Contains(binding.Values, fmt.Sprint(value)) {
			return invalid()
		}
		variables[variable] = value
	}
	return variables, nil
}

func bootstrapPage(route RouteShell, content []byte, metadata preloadMetadata, options Options) (http.Handler, error) {
	if bytes.Count(content, []byte(bootstrapSlot)) != 1 {
		return nil, fmt.Errorf("frontend %q must contain exactly one bootstrap slot", route.File)
	}
	preloads := metadata.Preloads
	for _, preload := range preloads {
		if options.IsQuery == nil || !options.IsQuery(preload.ID) {
			return nil, fmt.Errorf("frontend %q preloads unknown or non-query operation %q", route.Pattern, preload.ID)
		}
		for name, binding := range preload.Variables {
			if !slices.Contains([]string{"path", "query", "literal"}, binding.Source) ||
				!slices.Contains([]string{"", "string", "int", "boolean"}, binding.Type) ||
				((binding.Min != nil || binding.Max != nil) && binding.Type != "int") ||
				(binding.Min != nil && binding.Max != nil && *binding.Min > *binding.Max) {
				return nil, fmt.Errorf("frontend %q has an invalid binding for %s", route.Pattern, name)
			}
			if binding.Source == "path" {
				parameter := name
				if binding.Name != nil {
					parameter = *binding.Name
				}
				if !slices.ContainsFunc(route.Segments, func(segment Segment) bool { return segment.Kind != "static" && segment.Name == parameter }) {
					return nil, fmt.Errorf("frontend %q binds %s to unknown path parameter %q", route.Pattern, name, parameter)
				}
			}
		}
	}
	offset := bytes.Index(content, []byte(bootstrapSlot)) + len(bootstrapSlot) - len(`[]</script>`)
	timeout := time.Duration(metadata.PreloadTimeoutMs) * time.Millisecond
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		entries := make([]bootstrapEntry, 0, len(preloads))
		// Validate every binding before executing anything, even on signed-out requests.
		for _, preload := range preloads {
			variables, err := resolvePreloadVariables(preload.Variables, r)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if !preload.Authenticated || (options.Authenticated != nil && options.Authenticated(r)) {
				entries = append(entries, bootstrapEntry{ID: preload.ID, Variables: variables})
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method == http.MethodHead {
			return
		}
		body := make([]byte, 0, len(content))
		body = append(body, content[:offset]...)
		body = append(body, '[')
		preloadRequest := r
		if timeout > 0 {
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()
			preloadRequest = r.WithContext(ctx)
		}
		for _, entry := range entries {
			if preloadRequest.Context().Err() != nil {
				break
			}
			entry.Response = options.Execute(preloadRequest, entry.ID, entry.Variables)
			if preloadRequest.Context().Err() != nil {
				break
			}
			payload, err := json.Marshal(entry)
			if err != nil {
				continue
			}
			if len(body) > offset+1 {
				body = append(body, ',')
			}
			body = append(body, payload...)
		}
		body = append(body, ']')
		body = append(body, content[offset+2:]...)
		serveFrontendFile(w, r, route.File, body)
	}), nil
}
