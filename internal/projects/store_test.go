package projects

import (
	"strconv"
	"sync"
	"testing"
)

func TestSeededProjectsHaveReadableSlugs(t *testing.T) {
	store := slugTestStore(t, "team")
	project, ok := store.GetBySlug("team", "atlas-design-system")
	if !ok || project.Name != "Atlas design system" {
		t.Fatalf("seed slug did not resolve its project: %+v, found=%v", project, ok)
	}
	byID, ok := store.Get("team", project.ID)
	if !ok || byID != project {
		t.Fatalf("slug and ID lookups disagree: %+v, found=%v", byID, ok)
	}
	duplicate := slugTestCreate(t, store, "team", "Atlas design system")
	if duplicate.Slug != "atlas-design-system-2" {
		t.Fatalf("seed slug was not reserved: %q", duplicate.Slug)
	}
}

func TestCreatedProjectSlugsHandleNamesAndCollisions(t *testing.T) {
	for _, tc := range []struct {
		name, slug string
	}{
		{"  Release / notes... for 2026!  ", "release-notes-for-2026"},
		{"Déjà — Vu / 新项目 42", "déjà-vu-新项目-42"},
		{"ΆΛΦΑ_مشروع ١٢", "άλφα-مشروع-١٢"},
		{"--- !!! ---", "project"},
		{"🚀", "project"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := slugTestStore(t, "team")
			for n := 1; n <= 3; n++ {
				project := slugTestCreate(t, store, "team", tc.name)
				want := tc.slug
				if n > 1 {
					want += "-" + strconv.Itoa(n)
				}
				if project.Slug != want {
					t.Fatalf("creation %d slug = %q, want %q", n, project.Slug, want)
				}
				bySlug, ok := store.GetBySlug("team", want)
				if !ok || bySlug.ID != project.ID {
					t.Fatalf("creation %d slug resolved the wrong project: %+v, found=%v", n, bySlug, ok)
				}
			}
		})
	}
}

func TestProjectSlugsReserveNewPage(t *testing.T) {
	store := slugTestStore(t, "team")
	for _, slug := range []string{"new-2", "new-3"} {
		project := slugTestCreate(t, store, "team", "New")
		if project.Slug != slug {
			t.Fatalf("creation slug = %q, want %q", project.Slug, slug)
		}
		if got, ok := store.GetBySlug("team", slug); !ok || got.ID != project.ID {
			t.Fatalf("slug did not resolve its project: %+v, found=%v", got, ok)
		}
		if err := store.Delete("team", project.ID); err != nil {
			t.Fatal(err)
		}
	}
	if project, ok := store.GetBySlug("team", "new"); ok {
		t.Fatalf("creation page slug resolved a project: %+v", project)
	}
}

func TestRenamingProjectPreservesItsSlug(t *testing.T) {
	store := slugTestStore(t, "team")
	original := slugTestCreate(t, store, "team", "Original title")
	updated, err := store.Update("team", original.ID, Input{
		Name: "Changed title", Description: "Updated description", Status: Active,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.ID != original.ID || updated.Slug != original.Slug {
		t.Fatalf("rename changed the project's identity: before=%+v, after=%+v", original, updated)
	}
	bySlug, ok := store.GetBySlug("team", original.Slug)
	if !ok || bySlug.Name != "Changed title" || bySlug.Description != "Updated description" {
		t.Fatalf("original bookmark did not resolve the updated record: %+v, found=%v", bySlug, ok)
	}
	if _, ok := store.GetBySlug("team", "changed-title"); ok {
		t.Fatal("rename unexpectedly created a second project address")
	}
	if next := slugTestCreate(t, store, "team", "Original title"); next.Slug != "original-title-2" {
		t.Fatalf("rename released its original slug: %q", next.Slug)
	}
}

func TestDeletedProjectSlugsAreNeverReassigned(t *testing.T) {
	store := slugTestStore(t, "team")
	first := slugTestCreate(t, store, "team", "Temporary project")
	second := slugTestCreate(t, store, "team", "Temporary project")
	for _, project := range []Project{first, second} {
		if err := store.Delete("team", project.ID); err != nil {
			t.Fatal(err)
		}
		if _, ok := store.GetBySlug("team", project.Slug); ok {
			t.Fatalf("deleted project still resolves through %q", project.Slug)
		}
	}
	replacement := slugTestCreate(t, store, "team", "Temporary project")
	if replacement.Slug != "temporary-project-3" {
		t.Fatalf("deleted slug was reassigned: %q", replacement.Slug)
	}
	for _, project := range []Project{first, second} {
		if _, ok := store.GetBySlug("team", project.Slug); ok {
			t.Fatalf("old bookmark %q now resolves a different project", project.Slug)
		}
	}
}

func TestProjectSlugLookupAndAllocationAreWorkspaceScoped(t *testing.T) {
	store := slugTestStore(t, "one", "two")
	one := slugTestCreate(t, store, "one", "Shared title")
	two := slugTestCreate(t, store, "two", "Shared title")
	if one.Slug != "shared-title" || two.Slug != one.Slug || one.ID == two.ID {
		t.Fatalf("workspace allocation was not independent: one=%+v, two=%+v", one, two)
	}
	for namespace, want := range map[string]Project{"one": one, "two": two} {
		got, ok := store.GetBySlug(namespace, want.Slug)
		if !ok || got.ID != want.ID {
			t.Fatalf("%s slug resolved another workspace's project: %+v, found=%v", namespace, got, ok)
		}
	}
	private := slugTestCreate(t, store, "two", "Only in second workspace")
	for _, namespace := range []string{"one", "missing", ""} {
		if _, ok := store.GetBySlug(namespace, private.Slug); ok {
			t.Fatalf("%q could resolve a foreign or missing workspace project", namespace)
		}
	}
}

func TestConcurrentProjectCreationAllocatesDistinctSlugs(t *testing.T) {
	store := slugTestStore(t, "team")
	const count = 32
	type result struct {
		project Project
		err     error
	}
	results := make(chan result, count)
	var workers sync.WaitGroup
	for range count {
		workers.Go(func() {
			project, err := store.Create("team", Input{Name: "Parallel project", Status: Planned})
			results <- result{project, err}
		})
	}
	workers.Wait()
	close(results)
	seen := make(map[string]bool)
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		if seen[result.project.Slug] {
			t.Fatalf("concurrent creations shared slug %q", result.project.Slug)
		}
		seen[result.project.Slug] = true
		project, ok := store.GetBySlug("team", result.project.Slug)
		if !ok || project.ID != result.project.ID {
			t.Fatalf("slug resolved a different concurrent creation: %+v, found=%v", project, ok)
		}
	}
	for n := 1; n <= count; n++ {
		slug := "parallel-project"
		if n > 1 {
			slug += "-" + strconv.Itoa(n)
		}
		if !seen[slug] {
			t.Fatalf("concurrent allocation skipped expected slug %q", slug)
		}
	}
}

func slugTestStore(t *testing.T, namespaces ...string) *Store {
	t.Helper()
	store := NewStore()
	for _, namespace := range namespaces {
		if err := store.EnsureWorkspace(namespace, true); err != nil {
			t.Fatal(err)
		}
	}
	return store
}

func slugTestCreate(t *testing.T, store *Store, namespace, name string) Project {
	t.Helper()
	project, err := store.Create(namespace, Input{Name: name, Status: Planned})
	if err != nil {
		t.Fatal(err)
	}
	return project
}
