// Package routeadapter serves TanStack route shells and their initial query data
// through a Go HTTP handler using a portable build manifest.
package routeadapter

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

// Manifest is emitted by the TypeScript adapter during the frontend build.
type Manifest struct {
	Version  int          `json:"version"`
	Fallback string       `json:"fallback"`
	Routes   []RouteShell `json:"routes"`
}

// RouteShell identifies a route's prebuilt HTML and native matching segments.
type RouteShell struct {
	Pattern  string    `json:"pattern"`
	File     string    `json:"file"`
	RouteID  string    `json:"routeId"`
	Segments []Segment `json:"segments"`
}

// Options connects the adapter to an application's authentication and data layer.
// Execute returns the JSON response to hydrate into the browser data store.
type Options struct {
	ReservedPaths []string
	// UseFallback selects the fallback document for a matched route.
	// A nil callback serves the route's own document.
	UseFallback func(*http.Request) bool
	// Authenticated permits preloads marked authenticated.
	Authenticated func(*http.Request) bool
	IsQuery       func(string) bool
	// Execute must honor cancellation of the supplied request context.
	Execute func(*http.Request, string, map[string]any) any
}

// Frontend validates built route shells and serves their initial data and assets.
func Frontend(assets fs.FS, options Options) (http.Handler, error) {
	var manifest Manifest
	data, err := fs.ReadFile(assets, "route-shells.json")
	if err != nil {
		return nil, fmt.Errorf("read frontend route manifest: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode frontend route manifest: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("frontend route manifest must contain one JSON object")
	}
	if manifest.Version != 3 {
		return nil, fmt.Errorf("unsupported frontend route manifest version: %d", manifest.Version)
	}

	pages := make(map[string][]byte)
	loadPage := func(name string) ([]byte, error) {
		if !fs.ValidPath(name) || path.Ext(name) != ".html" || strings.ContainsAny(name, "\\?#%") {
			return nil, fmt.Errorf("invalid frontend HTML path %q", name)
		}
		if content := pages[name]; content != nil {
			return content, nil
		}
		content, err := fs.ReadFile(assets, name)
		if err != nil {
			return nil, fmt.Errorf("read frontend HTML %q: %w", name, err)
		}
		if len(content) == 0 {
			return nil, fmt.Errorf("frontend HTML %q is empty", name)
		}
		pages[name] = content
		return content, nil
	}
	fallback, err := loadPage(manifest.Fallback)
	if err != nil {
		return nil, err
	}
	fallbackMetadata, err := readPreloadMetadata(fallback)
	if err != nil {
		return nil, fmt.Errorf("frontend %q: %w", manifest.Fallback, err)
	}
	if len(fallbackMetadata.Preloads) != 0 {
		return nil, errors.New("frontend fallback metadata must not declare preloads")
	}
	fallbackPage := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveFrontendFile(w, r, manifest.Fallback, fallback)
	})
	matcher := &routeNode{}
	patterns := make(map[string]bool)
	identifiers := make(map[string]bool)
	for _, route := range manifest.Routes {
		if err := validateRoute(route, options.ReservedPaths); err != nil {
			return nil, err
		}
		if patterns[route.Pattern] || identifiers[route.RouteID] {
			return nil, fmt.Errorf("duplicate frontend route %q or identifier %q", route.Pattern, route.RouteID)
		}
		patterns[route.Pattern], identifiers[route.RouteID] = true, true
		content, err := loadPage(route.File)
		if err != nil {
			return nil, err
		}
		metadata, err := readPreloadMetadata(content)
		if err != nil {
			return nil, fmt.Errorf("frontend %q: %w", route.File, err)
		}
		var page http.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			serveFrontendFile(w, r, route.File, content)
		})
		var alternatePage http.Handler = fallbackPage
		if len(metadata.Preloads) != 0 {
			if options.IsQuery == nil || options.Execute == nil {
				return nil, errors.New("frontend preloads require query validation and execution")
			}
			page, err = bootstrapPage(route, content, metadata, options)
			if err != nil {
				return nil, err
			}
			alternatePage, err = bootstrapPage(route, fallback, metadata, options)
			if err != nil {
				return nil, err
			}
		}
		if options.UseFallback != nil {
			matchedPage := page
			page = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if options.UseFallback(r) {
					alternatePage.ServeHTTP(w, r)
					return
				}
				matchedPage.ServeHTTP(w, r)
			})
		}
		if err := matcher.add(route, page); err != nil {
			return nil, err
		}
	}
	matcher.sort()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// A top-level parameter must never turn an API typo into page HTML.
		if hasPathNamespace(r.URL.Path, options.ReservedPaths...) {
			http.NotFound(w, r)
			return
		}
		// Keep the same no-trailing-slash convention as the client router.
		// Work on the escaped path so an encoded slash inside a parameter stays intact.
		if escaped := r.URL.EscapedPath(); escaped != path.Clean(escaped) {
			target := *r.URL
			target.RawPath = path.Clean(escaped)
			target.Path, _ = url.PathUnescape(target.RawPath)
			http.Redirect(w, r, target.RequestURI(), http.StatusPermanentRedirect)
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name != "." && fs.ValidPath(name) {
			if info, err := fs.Stat(assets, name); err == nil && !info.IsDir() {
				content, err := fs.ReadFile(assets, name)
				if err != nil {
					http.NotFound(w, r)
					return
				}
				serveFrontendFile(w, r, name, content)
				return
			}
		}
		if hasPathNamespace(r.URL.Path, "/assets", "/_routes", "/_shell.html", "/route-shells.json") {
			http.NotFound(w, r)
			return
		}
		if match := matcher.match(decodeFrontendPath(r.URL.EscapedPath())); match != nil {
			for name, value := range match.params {
				r.SetPathValue(name, value)
			}
			r.Pattern = match.route.Pattern
			r = r.WithContext(withPathParams(r.Context(), match.params))
			match.handler.ServeHTTP(w, r)
			return
		}
		// Declared routes may contain periods, including affixed parameters.
		if path.Ext(r.URL.Path) != "" {
			http.NotFound(w, r)
			return
		}
		fallbackPage.ServeHTTP(w, r)
	}), nil
}

func hasPathNamespace(value string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if value == prefix || strings.HasPrefix(value, prefix+"/") {
			return true
		}
	}
	return false
}

func serveFrontendFile(w http.ResponseWriter, r *http.Request, name string, content []byte) {
	switch {
	case strings.HasSuffix(name, ".html"):
		if w.Header().Get("Cache-Control") == "" {
			w.Header().Set("Cache-Control", "no-cache")
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case strings.HasPrefix(name, "assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
	switch path.Ext(name) {
	case ".js", ".mjs", ".css", ".svg":
		if w.Header().Get("Content-Encoding") == "" {
			w.Header().Add("Vary", "Accept-Encoding")
			// Ranges describe the original bytes, so offer only identity for them.
			switch frontendEncoding(r, r.Header.Get("Range") == "") {
			case "gzip":
				var encoded bytes.Buffer
				writer := gzip.NewWriter(&encoded)
				_, _ = writer.Write(content) // bytes.Buffer writes cannot fail.
				_ = writer.Close()
				content = encoded.Bytes()
				w.Header().Set("Content-Encoding", "gzip")
				w.Header().Set("Content-Length", strconv.Itoa(len(content)))
				if w.Header().Get("Content-Type") == "" {
					w.Header().Set("Content-Type", mime.TypeByExtension(path.Ext(name)))
				}
			case "":
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "No acceptable content encoding is available.", http.StatusNotAcceptable)
				return
			}
		}
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(content))
}

// Delegate token and parameter parsing to MIME; only select between the two
// available representations. Explicit coding preferences override the wildcard.
func frontendEncoding(r *http.Request, allowGzip bool) string {
	quality := make(map[string]float64)
	for _, field := range r.Header.Values("Accept-Encoding") {
		for _, item := range strings.Split(field, ",") {
			coding, params, err := mime.ParseMediaType(item)
			if err != nil {
				continue
			}
			q := 1.0
			if value, present := params["q"]; present {
				q, err = strconv.ParseFloat(value, 64)
				if err != nil || !(q >= 0 && q <= 1) {
					q = 0
				}
			}
			quality[coding] = q
		}
	}
	gzipQuality, explicit := quality["gzip"]
	if !explicit {
		gzipQuality = quality["*"]
	}
	identityQuality, explicit := quality["identity"]
	if !explicit {
		identityQuality = 1
		if wildcard, present := quality["*"]; present && wildcard == 0 {
			identityQuality = 0
		}
	}
	if allowGzip && gzipQuality > 0 && gzipQuality >= identityQuality {
		return "gzip"
	}
	if identityQuality > 0 {
		return "identity"
	}
	return ""
}
