package server

import (
	"strings"
	"testing"

	"github.com/graphql-go/graphql/language/parser"
)

func TestQueryLimitsAcceptEscapedBlockStrings(t *testing.T) {
	_, host := fixture(t, Config{})
	for _, value := range []string{
		`"""literal \"""` + strings.Repeat("[", 65) + `"""`,
		`"""literal ` + strings.Repeat("[", 65) + `"""`,
	} {
		query := `query BlockString { projects(search: ` + value + `) { totalCount } }`
		if _, err := parser.Parse(parser.ParseParams{Source: query}); err != nil {
			t.Fatalf("regression fixture must be valid GraphQL: %v", err)
		}
		result := graph(t, browser(t), host.URL, query, nil)
		// Admission must reach the real resolver, which still enforces auth.
		errorCode(t, result, "UNAUTHENTICATED")
	}
}

func TestQueryLimitsStillBoundNestedInputValues(t *testing.T) {
	query := `{ projects(search: ` + strings.Repeat("[", 65) + `"value"` + strings.Repeat("]", 65) + `) { totalCount } }`
	if err := checkQueryLimits(query); err == nil || err.Error() != "The GraphQL document is too deeply nested." {
		t.Fatalf("recursive input parsing lost its admission limit: %v", err)
	}
}
