// Package authz evaluates Acme's embedded OPA policy in the Go process.
package authz

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/open-policy-agent/opa/v1/rego"
)

//go:embed policy.rego
var source string

// Subject contains identity derived from a validated server-side session.
type Subject struct {
	Role      string
	Namespace string
}

// Policy is compiled once and can be evaluated concurrently across requests.
type Policy struct {
	query rego.PreparedEvalQuery
}

// New compiles the policy, failing startup rather than silently allowing access.
func New(ctx context.Context) (*Policy, error) {
	query, err := rego.New(
		rego.Query("data.acme.authz.allow"),
		rego.Module("acme.rego", source),
	).PrepareForEval(ctx)
	if err != nil {
		return nil, fmt.Errorf("compile authorization policy: %w", err)
	}
	return &Policy{query: query}, nil
}

// Allow evaluates an action against a server-selected workspace. Missing or
// unknown identities and actions are denied by the policy.
func (p *Policy) Allow(ctx context.Context, subject Subject, action, namespace string) (bool, error) {
	results, err := p.query.Eval(ctx, rego.EvalInput(map[string]any{
		"subject": map[string]any{
			"authenticated": subject.Namespace != "",
			"namespace":     subject.Namespace,
			"role":          subject.Role,
		},
		"action":   action,
		"resource": map[string]any{"namespace": namespace},
	}))
	if err != nil {
		return false, fmt.Errorf("evaluate authorization policy: %w", err)
	}
	return results.Allowed(), nil
}
