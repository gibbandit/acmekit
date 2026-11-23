package server

import (
	"strings"
	"testing"
)

type slugProjectResult struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

const createSlugProjectMutation = `mutation Create($input: CreateProjectInput!) {
  createProject(input: $input) { project { id slug name } }
}`

const projectBySlugQuery = `query ProjectBySlug($slug: String!) {
  projectBySlug(slug: $slug) { id slug name }
}`

func TestProjectBySlugKeepsNodeIdentityAfterRename(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	owner := browser(t)
	login(t, owner, host.URL, "MAINTAINER")
	created := dataAs[struct{ Project slugProjectResult }](t, graph(t, owner, host.URL,
		createSlugProjectMutation, map[string]any{"input": map[string]any{
			"name": "Human readable project", "description": "Slug lookup coverage", "status": "PLANNED",
		}}), "createProject").Project
	if created.ID == "" || created.Slug == "" || created.Slug == created.ID {
		t.Fatalf("missing separate project identity and slug: %+v", created)
	}

	lookup := `query Lookups($id: ID!, $slug: String!) {
  projectBySlug(slug: $slug) { id slug name }
  project(id: $id) { id slug name }
  node(id: $id) { id ... on Project { slug name } }
}`
	for _, expected := range []slugProjectResult{created, {
		ID: created.ID, Slug: created.Slug, Name: "Renamed without changing the URL",
	}} {
		if expected.Name != created.Name {
			updated := dataAs[struct{ Project slugProjectResult }](t, graph(t, owner, host.URL,
				`mutation Update($input: UpdateProjectInput!) {
  updateProject(input: $input) { project { id slug name } }
}`, map[string]any{"input": map[string]any{
					"id": created.ID, "name": expected.Name, "description": "Updated description", "status": "ACTIVE",
				}}), "updateProject").Project
			if updated != expected {
				t.Fatalf("rename changed stable identity or slug: got %+v, want %+v", updated, expected)
			}
		}
		result := graph(t, owner, host.URL, lookup, map[string]any{"id": created.ID, "slug": created.Slug})
		for _, field := range []string{"projectBySlug", "project", "node"} {
			actual := dataAs[slugProjectResult](t, result, field)
			if actual != expected {
				t.Fatalf("%s returned different project identity: got %+v, want %+v", field, actual, expected)
			}
		}
	}

	legacy := dataAs[slugProjectResult](t, graph(t, owner, host.URL, projectBySlugQuery,
		map[string]any{"slug": created.ID}), "projectBySlug")
	if legacy.ID != created.ID || legacy.Slug != created.Slug || legacy.Name != "Renamed without changing the URL" {
		t.Fatalf("legacy Relay-ID URL did not resolve to the current project: %+v", legacy)
	}
}

func TestProjectBySlugMissingAndWorkspaceAccess(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	owner, member, anonymous := browser(t), browser(t), browser(t)
	login(t, owner, host.URL, "MAINTAINER")
	login(t, member, host.URL, "MEMBER")
	created := dataAs[struct{ Project slugProjectResult }](t, graph(t, owner, host.URL,
		createSlugProjectMutation, map[string]any{"input": map[string]any{
			"name": "Private owner slug lookup", "description": "Not in any other workspace", "status": "ACTIVE",
		}}), "createProject").Project
	viewer := dataAs[struct{ ID string }](t, graph(t, owner, host.URL, `{ viewer { id } }`, nil), "viewer")

	for _, slug := range []string{
		"", "missing-project", "not a valid /slug", strings.Repeat("x", 257),
		encodeID("Project", "missing-id"), viewer.ID, encodeID("Team", "missing-id"),
	} {
		t.Run("missing/"+slug, func(t *testing.T) {
			result := graph(t, owner, host.URL, projectBySlugQuery, map[string]any{"slug": slug})
			noErrors(t, result)
			if string(result.Data["projectBySlug"]) != "null" {
				t.Fatalf("missing slug exposed a project: %+v", result)
			}
		})
	}
	for _, slug := range []string{created.Slug, created.ID} {
		result := graph(t, member, host.URL, projectBySlugQuery, map[string]any{"slug": slug})
		noErrors(t, result)
		if string(result.Data["projectBySlug"]) != "null" {
			t.Fatalf("slug lookup crossed a workspace boundary: %+v", result)
		}
	}
	errorCode(t, graph(t, anonymous, host.URL, projectBySlugQuery,
		map[string]any{"slug": created.Slug}), "UNAUTHENTICATED")

	memberProjects := dataAs[struct {
		Edges []struct{ Node slugProjectResult }
	}](t, graph(t, member, host.URL, `{ projects(first: 1) { edges { node { id slug name } } } }`, nil), "projects")
	if len(memberProjects.Edges) != 1 {
		t.Fatalf("expected a member-owned seed project: %+v", memberProjects)
	}
	expected := memberProjects.Edges[0].Node
	actual := dataAs[slugProjectResult](t, graph(t, member, host.URL, projectBySlugQuery,
		map[string]any{"slug": expected.Slug}), "projectBySlug")
	if actual != expected {
		t.Fatalf("member could not read its own workspace slug: got %+v, want %+v", actual, expected)
	}
}
