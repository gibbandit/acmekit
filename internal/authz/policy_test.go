package authz

import (
	"context"
	"testing"
)

func TestPolicyDeniesUnknownRolesActionsAndOtherWorkspaces(t *testing.T) {
	policy, err := New(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		Role, SubjectNamespace, ResourceNamespace, Action string
		Want                                              bool
	}{
		{"MAINTAINER", "one", "one", "project:read", true},
		{"MAINTAINER", "one", "one", "project:create", true},
		{"MAINTAINER", "one", "one", "project:update", true},
		{"MAINTAINER", "one", "one", "project:delete", true},
		{"MEMBER", "one", "one", "project:read", true},
		{"MEMBER", "one", "one", "project:create", false},
		{"MAINTAINER", "one", "two", "project:read", false},
		{"MAINTAINER", "one", "two", "project:delete", false},
		{"ADMIN", "one", "one", "project:create", false},
		{"MAINTAINER", "one", "one", "unrecognized", false},
		{"MAINTAINER", "", "", "project:read", false},
	} {
		got, err := policy.Allow(context.Background(), Subject{Role: tc.Role, Namespace: tc.SubjectNamespace}, tc.Action, tc.ResourceNamespace)
		if err != nil {
			t.Fatal(err)
		}
		if got != tc.Want {
			t.Errorf("policy %+v: got %t", tc, got)
		}
	}
}
