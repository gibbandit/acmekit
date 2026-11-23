package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/graphql-go/graphql"
)

func TestGraphQLResolverErrorsHaveSafeMessages(t *testing.T) {
	const detail = "private resolver diagnostic sentinel"
	for _, tc := range []struct {
		name, message, code string
		resolve             graphql.FieldResolveFn
		logs                int
	}{
		{"panic", "Something went wrong. Please try again.", "INTERNAL_ERROR", func(graphql.ResolveParams) (interface{}, error) { panic(detail) }, 2},
		{"returned error", "Something went wrong. Please try again.", "INTERNAL_ERROR", func(graphql.ResolveParams) (interface{}, error) { return nil, errors.New(detail) }, 2},
		{"wrapped expected error", "Choose a valid value.", "BAD_USER_INPUT", func(graphql.ResolveParams) (interface{}, error) {
			return nil, fmt.Errorf("%s: %w", detail, badInput("Choose a valid value."))
		}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			const operation = `query ResolverFault { viewer { id } serverInfo { name } }`
			operations, err := json.Marshal(map[string]string{"fault": operation})
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			app, err := newServer(Config{
				Operations: operations,
				Logger:     slog.New(slog.NewJSONHandler(&logs, nil)),
			}, bootstrapFiles(t, []pagePreload{{ID: "fault", Variables: map[string]variableBinding{}}}))
			if err != nil {
				t.Fatal(err)
			}
			// Inject before serving: exercise the real API and bootstrap boundary,
			// including graphql-go's internal recovery rather than HTTP recovery.
			app.schema.QueryType().Fields()["viewer"].Resolve = tc.resolve
			host := httptest.NewServer(app.handler())
			t.Cleanup(host.Close)
			client := browser(t)

			status, body, _ := postJSON(t, client, host.URL+"/graphql", map[string]any{"id": "fault"}, host.URL)
			if status != http.StatusOK || bytes.Contains(body, []byte(detail)) {
				t.Fatalf("unsafe GraphQL response: HTTP %d %s", status, body)
			}
			var result graphql.Result
			if err := json.Unmarshal(body, &result); err != nil {
				t.Fatal(err)
			}
			if len(result.Errors) != 1 || result.Errors[0].Message != tc.message || result.Errors[0].Extensions["code"] != tc.code {
				t.Fatalf("unexpected safe GraphQL error: %+v", result.Errors)
			}
			if len(result.Errors[0].Path) != 1 || result.Errors[0].Path[0] != "viewer" || len(result.Errors[0].Locations) == 0 {
				t.Fatalf("GraphQL error lost its public location: %+v", result.Errors[0])
			}
			data := result.Data.(map[string]any)
			if data["viewer"] != nil || data["serverInfo"].(map[string]any)["name"] != "Acme" {
				t.Fatalf("safe sibling data was lost: %+v", data)
			}

			entries, html := readPageDataWithHTML(t, client, host.URL+"/projects/example", preloadMetadataHTML(t, "Sign in", []pagePreload{}))
			if strings.Contains(html, detail) || len(entries) != 1 || entries[0].ID != "fault" {
				t.Fatalf("unsafe bootstrap response: %s", html)
			}
			failure := entries[0].Response.Errors
			if len(failure) != 1 || failure[0].Message != tc.message || failure[0].Extensions.Code != tc.code {
				t.Fatalf("bootstrap did not use the API error boundary: %+v", failure)
			}

			decoder := json.NewDecoder(&logs)
			for range tc.logs {
				var entry struct {
					Level string   `json:"level"`
					Msg   string   `json:"msg"`
					Error string   `json:"error"`
					Path  []string `json:"path"`
				}
				if err := decoder.Decode(&entry); err != nil {
					t.Fatalf("missing diagnostic log: %v", err)
				}
				if entry.Level != "ERROR" || entry.Msg != "GraphQL resolver failed" || entry.Error != detail || len(entry.Path) != 1 || entry.Path[0] != "viewer" {
					t.Fatalf("resolver diagnostic was lost: %+v", entry)
				}
			}
			if err := decoder.Decode(new(any)); err != io.EOF {
				t.Fatalf("unexpected additional logs: %v", err)
			}
		})
	}
}

func TestGraphQLExpectedErrorsRemainActionable(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	for _, tc := range []struct {
		name, query, operation, message, code string
		authenticated                         bool
		status                                int
	}{
		{name: "authorization", query: `{ projects { totalCount } }`, message: "Sign in to continue.", code: "UNAUTHENTICATED", status: http.StatusOK},
		{name: "application validation", query: `{ projects(first: 51) { totalCount } }`, message: "first must be between 0 and 50.", code: "BAD_USER_INPUT", authenticated: true, status: http.StatusOK},
		{name: "schema validation", query: `{ serverInfo { missing } }`, message: `Cannot query field "missing"`, status: http.StatusOK},
		{name: "variable coercion", query: `query Required($first: Int!) { projects(first: $first) { totalCount } }`, message: `Variable "$first" of required type "Int!" was not provided.`, status: http.StatusOK},
		{name: "operation selection", query: `query Info { serverInfo { name } }`, operation: "Missing", message: `Unknown operation named "Missing".`, status: http.StatusOK},
		{name: "syntax", query: `{`, message: "The GraphQL document could not be parsed.", code: "BAD_QUERY", status: http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := browser(t)
			if tc.authenticated {
				login(t, client, host.URL, "MAINTAINER")
			}
			status, body, _ := postJSON(t, client, host.URL+"/graphql", map[string]any{"query": tc.query, "operationName": tc.operation}, host.URL)
			var result graphResult
			if err := json.Unmarshal(body, &result); err != nil {
				t.Fatal(err)
			}
			if status != tc.status || len(result.Errors) != 1 || !strings.Contains(result.Errors[0].Message, tc.message) || result.Errors[0].Extensions.Code != tc.code {
				t.Fatalf("actionable error changed: HTTP %d %s", status, body)
			}
		})
	}
}
