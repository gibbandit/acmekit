package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gibbandit/acmekit/routeadapter"
	"github.com/graphql-go/graphql/language/ast"
	"github.com/graphql-go/graphql/language/parser"
)

type persistedOperation struct {
	document string
	query    bool
}

func loadOperations(data []byte) (map[string]persistedOperation, error) {
	operations := make(map[string]persistedOperation)
	if len(data) == 0 {
		return operations, nil
	}
	var documents map[string]string
	if err := json.Unmarshal(data, &documents); err != nil || documents == nil {
		return nil, errors.New("persisted operations must be a JSON object mapping IDs to GraphQL documents")
	}
	for id, text := range documents {
		if id == "" || len(text) > 32<<10 {
			return nil, fmt.Errorf("invalid persisted operation %q", id)
		}
		document, err := parser.Parse(parser.ParseParams{Source: text})
		if err != nil {
			return nil, fmt.Errorf("parse persisted operation %q: %w", id, err)
		}
		count, query := 0, false
		for _, definition := range document.Definitions {
			if operation, ok := definition.(*ast.OperationDefinition); ok {
				count++
				query = operation.Operation == ast.OperationTypeQuery
			}
		}
		if count != 1 {
			return nil, fmt.Errorf("persisted operation %q must contain exactly one operation", id)
		}
		operations[id] = persistedOperation{document: text, query: query}
	}
	return operations, nil
}

func (s *server) routeAdapterOptions() routeadapter.Options {
	return routeadapter.Options{
		ReservedPaths: []string{"/auth", "/graphql", "/api", "/healthz"},
		UseFallback:   func(r *http.Request) bool { return currentUser(r.Context()) == nil },
		Authenticated: func(r *http.Request) bool { return currentUser(r.Context()) != nil },
		IsQuery: func(id string) bool {
			operation, ok := s.operations[id]
			return ok && operation.query
		},
		Execute: func(r *http.Request, id string, variables map[string]any) any {
			result, _ := s.executeGraphQL(r.Context(), s.operations[id].document, "", variables)
			return result
		},
	}
}
