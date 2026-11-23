package routeadapter

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
)

func TestFrontendStaticCompression(t *testing.T) {
	files := frontendFiles(t, frontendManifest())
	for name, content := range map[string]string{
		"assets/app-abcd1234.js": strings.Repeat("console.log('Acme static asset');\n", 100),
		"assets/module-123.mjs":  strings.Repeat("export const project = 'Acme';\n", 100),
		"assets/style-123.css":   strings.Repeat(".project { color: blue; }\n", 100),
		"favicon.svg":            "<svg>" + strings.Repeat("<path d=\"M0 0h10v10\"/>", 100) + "</svg>",
	} {
		files[name] = &fstest.MapFile{Data: []byte(content)}
	}
	handler, err := Frontend(files, Options{ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"assets/app-abcd1234.js", "assets/module-123.mjs", "assets/style-123.css", "favicon.svg"} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/"+name, nil)
			request.Header.Set("Accept-Encoding", "gzip")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK || response.Header().Get("Content-Encoding") != "gzip" || response.Header().Get("Vary") != "Accept-Encoding" {
				t.Fatalf("wrong compressed response: %d %v", response.Code, response.Header())
			}
			reader, err := gzip.NewReader(bytes.NewReader(response.Body.Bytes()))
			if err != nil {
				t.Fatal(err)
			}
			defer reader.Close()
			decoded, err := io.ReadAll(reader)
			if err != nil || !bytes.Equal(decoded, files[name].Data) || response.Body.Len() >= len(decoded) {
				t.Fatalf("gzip changed the asset or saved no bytes: %v", err)
			}
			if response.Header().Get("Content-Length") != strconv.Itoa(response.Body.Len()) {
				t.Fatalf("compressed length differs from bytes: %v", response.Header())
			}
			wantCache := "public, max-age=3600"
			if strings.HasPrefix(name, "assets/") {
				wantCache = "public, max-age=31536000, immutable"
			}
			if response.Header().Get("Cache-Control") != wantCache {
				t.Fatalf("compression changed caching: %v", response.Header())
			}

			head := httptest.NewRecorder()
			headRequest := httptest.NewRequest(http.MethodHead, "/"+name, nil)
			headRequest.Header.Set("Accept-Encoding", "gzip")
			handler.ServeHTTP(head, headRequest)
			if head.Code != http.StatusOK || head.Body.Len() != 0 {
				t.Fatalf("HEAD returned a body: %d %q", head.Code, head.Body.String())
			}
			for _, header := range []string{"Content-Type", "Content-Encoding", "Content-Length", "Cache-Control", "Vary"} {
				if head.Header().Get(header) != response.Header().Get(header) {
					t.Fatalf("HEAD %s differs from GET: %v / %v", header, head.Header(), response.Header())
				}
			}

			rangeRequest := httptest.NewRequest(http.MethodGet, "/"+name, nil)
			rangeRequest.Header.Set("Accept-Encoding", "gzip")
			rangeRequest.Header.Set("Range", "bytes=5-14")
			partial := httptest.NewRecorder()
			handler.ServeHTTP(partial, rangeRequest)
			if partial.Code != http.StatusPartialContent || partial.Header().Get("Content-Encoding") != "" || !bytes.Equal(partial.Body.Bytes(), files[name].Data[5:15]) {
				t.Fatalf("compression changed range bytes: %d %v %q", partial.Code, partial.Header(), partial.Body.String())
			}
			if partial.Header().Get("Content-Range") != "bytes 5-14/"+strconv.Itoa(len(files[name].Data)) || partial.Header().Get("Content-Length") != "10" || partial.Header().Get("Cache-Control") != wantCache {
				t.Fatalf("compression changed range metadata: %v", partial.Header())
			}
		})
	}
}

func TestFrontendCompressionNegotiation(t *testing.T) {
	for _, tc := range []struct {
		name, accept, encoding string
		status                 int
	}{
		{"absent", "", "", http.StatusOK},
		{"gzip", "gzip", "gzip", http.StatusOK},
		{"case insensitive", "GZIP", "gzip", http.StatusOK},
		{"gzip refused", "gzip;q=0", "", http.StatusOK},
		{"explicit refusal beats wildcard", "gzip;q=0, *;q=1", "", http.StatusOK},
		{"wildcard", "*", "gzip", http.StatusOK},
		{"wildcard refused", "*;q=0", "", http.StatusNotAcceptable},
		{"explicit identity beats wildcard", "*;q=0, identity", "", http.StatusOK},
		{"identity preferred", "gzip;q=0.2, identity;q=0.8", "", http.StatusOK},
		{"gzip preferred", "gzip;q=0.8, identity;q=0.2", "gzip", http.StatusOK},
		{"gzip beats wildcard refusal", "gzip;q=1, *;q=0", "gzip", http.StatusOK},
		{"unsupported", "br", "", http.StatusOK},
		{"unsupported without identity", "br, identity;q=0", "", http.StatusNotAcceptable},
		{"all refused", "gzip;q=0, identity;q=0", "", http.StatusNotAcceptable},
		{"invalid weight", "gzip;q=invalid, *;q=1", "", http.StatusOK},
		{"nonfinite weight", "gzip;q=NaN", "", http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
			request.Header.Set("Accept-Encoding", tc.accept)
			response := httptest.NewRecorder()
			serveFrontendFile(response, request, "assets/app.js", []byte("const acme = true;"))
			if response.Code != tc.status || response.Header().Get("Content-Encoding") != tc.encoding || response.Header().Get("Vary") != "Accept-Encoding" {
				t.Fatalf("wrong negotiation: %d %v", response.Code, response.Header())
			}
			if tc.status == http.StatusNotAcceptable && response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("unacceptable representation was cacheable: %v", response.Header())
			}
			if tc.status == http.StatusOK && tc.encoding == "" && response.Body.String() != "const acme = true;" {
				t.Fatalf("identity representation changed: %q", response.Body.String())
			}
		})
	}
	request := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	request.Header.Add("Accept-Encoding", "br")
	request.Header.Add("Accept-Encoding", "gzip;q=0.8, identity;q=0.2")
	response := httptest.NewRecorder()
	serveFrontendFile(response, request, "assets/app.js", []byte("const acme = true;"))
	if response.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("multiple header fields were not negotiated: %v", response.Header())
	}
	request.Header.Set("Accept-Encoding", "gzip, identity;q=0")
	request.Header.Set("Range", "bytes=0-4")
	response = httptest.NewRecorder()
	serveFrontendFile(response, request, "assets/app.js", []byte("const acme = true;"))
	if response.Code != http.StatusNotAcceptable {
		t.Fatalf("identity-forbidden range used an unacceptable encoding: %d %v", response.Code, response.Header())
	}
}

func TestFrontendCompressionDoesNotDoubleEncode(t *testing.T) {
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write([]byte("const acme = true;")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	response := httptest.NewRecorder()
	response.Header().Set("Content-Encoding", "gzip")
	serveFrontendFile(response, request, "assets/app.js", encoded.Bytes())
	if response.Code != http.StatusOK || response.Header().Get("Content-Encoding") != "gzip" || !bytes.Equal(response.Body.Bytes(), encoded.Bytes()) {
		t.Fatalf("existing encoded bytes changed: %d %v", response.Code, response.Header())
	}
}
