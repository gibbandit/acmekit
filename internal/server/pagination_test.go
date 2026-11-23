package server

import "testing"

const anchoredConnectionQuery = `query AnchoredProjects($first: Int, $after: String, $anchor: String, $search: String, $status: ProjectStatus) {
  projects(first: $first, after: $after, anchor: $anchor, search: $search, status: $status) {
    totalCount edges { cursor node { id name description status } }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
  }
}`

func assertProjectWindow(t *testing.T, page connectionResult, expected []projectResult) {
	t.Helper()
	if len(page.Edges) != len(expected) {
		t.Fatalf("window returned %d projects, want %d: %+v", len(page.Edges), len(expected), page)
	}
	for index, project := range expected {
		if page.Edges[index].Node.ID != project.ID {
			t.Fatalf("project %d escaped the requested window: %s, want %s", index, page.Edges[index].Node.ID, project.ID)
		}
	}
}

func TestProjectConnectionAnchorPaginationAndRefresh(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	client := browser(t)
	login(t, client, host.URL, "MAINTAINER")
	all := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"first": 50}), "projects")
	if len(all.Edges) != 10 {
		t.Fatalf("unexpected seed projects: %+v", all)
	}
	anchor := all.Edges[2].Cursor
	firstVariables := map[string]any{"first": 2, "anchor": anchor}
	first := dataAs[connectionResult](t, graph(t, client, host.URL, anchoredConnectionQuery, firstVariables), "projects")
	expected := []projectResult{all.Edges[3].Node, all.Edges[4].Node}
	assertProjectWindow(t, first, expected)
	if first.TotalCount != all.TotalCount || !first.PageInfo.HasPreviousPage || !first.PageInfo.HasNextPage ||
		first.PageInfo.StartCursor == nil || *first.PageInfo.StartCursor != first.Edges[0].Cursor ||
		first.PageInfo.EndCursor == nil || *first.PageInfo.EndCursor != first.Edges[1].Cursor {
		t.Fatalf("anchored connection has invalid page info: %+v", first)
	}
	next := dataAs[connectionResult](t, graph(t, client, host.URL, anchoredConnectionQuery, map[string]any{
		"first": 2, "anchor": anchor, "after": first.PageInfo.EndCursor,
	}), "projects")
	assertProjectWindow(t, next, []projectResult{all.Edges[5].Node, all.Edges[6].Node})

	// A refresh starts at the same anchor even after loading later chunks.
	updated := expected[0]
	updated.Name = "Updated anchored project"
	noErrors(t, graph(t, client, host.URL, updateMutation, map[string]any{"input": map[string]any{
		"id": updated.ID, "name": updated.Name, "description": updated.Description, "status": updated.Status,
	}}))
	noErrors(t, graph(t, client, host.URL, createMutation, map[string]any{"input": map[string]any{
		"name": "New project before the anchor", "description": "", "status": "ACTIVE",
	}}))
	refreshed := dataAs[connectionResult](t, graph(t, client, host.URL, anchoredConnectionQuery, firstVariables), "projects")
	assertProjectWindow(t, refreshed, expected)
	if refreshed.Edges[0].Node.Name != updated.Name || refreshed.TotalCount != all.TotalCount+1 {
		t.Fatalf("anchor refresh did not return fresh data: %+v", refreshed)
	}
}

func TestProjectConnectionAnchorCannotBeBypassedByAfter(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	client := browser(t)
	login(t, client, host.URL, "MAINTAINER")
	all := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"first": 50}), "projects")
	for _, tc := range []struct {
		name          string
		anchor, after int
	}{
		{"after precedes anchor", 3, 1},
		{"after advances anchor", 1, 3},
		{"after equals anchor", 3, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			page := dataAs[connectionResult](t, graph(t, client, host.URL, anchoredConnectionQuery, map[string]any{
				"first": 2, "anchor": all.Edges[tc.anchor].Cursor, "after": all.Edges[tc.after].Cursor,
			}), "projects")
			assertProjectWindow(t, page, []projectResult{all.Edges[4].Node, all.Edges[5].Node})
		})
	}
}

func TestProjectConnectionAnchorValidation(t *testing.T) {
	_, host := fixture(t, Config{DemoMode: true})
	client, other := browser(t), browser(t)
	login(t, client, host.URL, "MAINTAINER")
	login(t, other, host.URL, "MAINTAINER")
	all := dataAs[connectionResult](t, graph(t, client, host.URL, connectionQuery, map[string]any{"first": 3}), "projects")
	anchor := all.Edges[1].Cursor
	for _, tc := range []struct {
		name      string
		variables map[string]any
	}{
		{"malformed anchor", map[string]any{"anchor": "not-a-cursor"}},
		{"tampered anchor", map[string]any{"anchor": anchor + "changed"}},
		{"invalid anchor with valid after", map[string]any{"anchor": "not-a-cursor", "after": anchor}},
		{"invalid after with valid anchor", map[string]any{"anchor": anchor, "after": "not-a-cursor"}},
		{"different status", map[string]any{"anchor": anchor, "status": "ACTIVE"}},
		{"different search", map[string]any{"anchor": anchor, "search": "Atlas"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			errorCode(t, graph(t, client, host.URL, anchoredConnectionQuery, tc.variables), "BAD_USER_INPUT")
		})
	}
	errorCode(t, graph(t, other, host.URL, anchoredConnectionQuery, map[string]any{"anchor": anchor}), "BAD_USER_INPUT")
}
