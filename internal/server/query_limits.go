package server

import (
	"errors"

	"github.com/graphql-go/graphql/language/ast"
	"github.com/graphql-go/graphql/language/lexer"
	"github.com/graphql-go/graphql/language/parser"
	"github.com/graphql-go/graphql/language/source"
)

// checkQueryLimits bounds work before execution, including fragment expansion.
// The limits allow Relay's ordinary generated queries and schema introspection.
func checkQueryLimits(query string) error {
	if err := checkRawNesting(query); err != nil {
		return err
	}
	document, err := parser.Parse(parser.ParseParams{Source: query})
	if err != nil {
		return errors.New("The GraphQL document could not be parsed.")
	}
	fragments := make(map[string]*ast.FragmentDefinition)
	operations := make([]*ast.OperationDefinition, 0, 1)
	for _, definition := range document.Definitions {
		switch definition := definition.(type) {
		case *ast.FragmentDefinition:
			fragments[definition.Name.Value] = definition
		case *ast.OperationDefinition:
			if definition.Operation == ast.OperationTypeSubscription {
				return errors.New("This sample API does not provide a subscription transport.")
			}
			operations = append(operations, definition)
		}
	}
	if len(operations) == 0 || len(operations) > 8 {
		return errors.New("Provide between one and eight named operations.")
	}
	fields := 0
	var walk func(*ast.SelectionSet, int, map[string]bool) error
	walk = func(selections *ast.SelectionSet, depth int, seen map[string]bool) error {
		if selections == nil {
			return nil
		}
		if depth > 20 {
			return errors.New("The GraphQL query is too deeply nested.")
		}
		for _, selection := range selections.Selections {
			fields++
			if fields > 1000 {
				return errors.New("The GraphQL query contains too many selections.")
			}
			switch selection := selection.(type) {
			case *ast.Field:
				if err := walk(selection.SelectionSet, depth+1, seen); err != nil {
					return err
				}
			case *ast.InlineFragment:
				if err := walk(selection.SelectionSet, depth, seen); err != nil {
					return err
				}
			case *ast.FragmentSpread:
				name := selection.Name.Value
				if seen[name] {
					return errors.New("GraphQL fragments cannot contain cycles.")
				}
				fragment := fragments[name]
				if fragment == nil {
					return errors.New("The query refers to an unknown GraphQL fragment.")
				}
				seen[name] = true
				if err := walk(fragment.SelectionSet, depth, seen); err != nil {
					return err
				}
				delete(seen, name)
			}
		}
		return nil
	}
	for _, operation := range operations {
		if err := walk(operation.SelectionSet, 1, make(map[string]bool)); err != nil {
			return err
		}
	}
	return nil
}

// Bound recursive parser work using native tokens, which already handle quoted
// strings, escaped block strings, and comments without treating them as syntax.
func checkRawNesting(query string) error {
	next := lexer.Lex(source.NewSource(&source.Source{Body: []byte(query)}))
	depth := 0
	for {
		token, err := next(0)
		if err != nil {
			return errors.New("The GraphQL document could not be parsed.")
		}
		switch token.Kind {
		case lexer.EOF:
			return nil
		case lexer.BRACE_L, lexer.PAREN_L, lexer.BRACKET_L:
			depth++
			if depth > 64 {
				return errors.New("The GraphQL document is too deeply nested.")
			}
		case lexer.BRACE_R, lexer.PAREN_R, lexer.BRACKET_R:
			depth--
		}
	}
}
