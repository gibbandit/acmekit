// Package projects provides the small, process-local repository used by Acme.
// Each workspace is addressed by an authenticated server-side namespace.
package projects

import (
	"crypto/rand"
	"errors"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	Active               = "ACTIVE"
	Planned              = "PLANNED"
	Archived             = "ARCHIVED"
	MaxNameLength        = 80
	MaxDescriptionLength = 1200
	MaxProjects          = 250
)

var (
	ErrNotFound = errors.New("project not found")
	ErrCapacity = errors.New("this sample workspace has reached its project limit")
)

// Project is a repository record, not the public GraphQL model.
type Project struct {
	ID          string
	Slug        string
	Name        string
	Description string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Input contains the editable properties of a project.
type Input struct {
	Name        string
	Description string
	Status      string
}

// Validate normalizes whitespace and validates application constraints.
func (in Input) Validate() (Input, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	if !utf8.ValidString(in.Name) || utf8.RuneCountInString(in.Name) < 1 || utf8.RuneCountInString(in.Name) > MaxNameLength {
		return Input{}, errors.New("project name must contain between 1 and 80 characters")
	}
	for _, r := range in.Name {
		if unicode.IsControl(r) {
			return Input{}, errors.New("project name must be a single line without control characters")
		}
	}
	if !utf8.ValidString(in.Description) || utf8.RuneCountInString(in.Description) > MaxDescriptionLength || strings.ContainsRune(in.Description, '\x00') {
		return Input{}, errors.New("description must contain at most 1200 characters and no null characters")
	}
	if !ValidStatus(in.Status) {
		return Input{}, errors.New("choose an active, planned, or archived status")
	}
	return in, nil
}

// ValidStatus reports whether a status belongs to the public API enum.
func ValidStatus(status string) bool {
	return status == Active || status == Planned || status == Archived
}

type workspace struct {
	projects map[string]Project
	// Keep deleted records' slugs reserved so old links never identify new work.
	slugs   map[string]string
	created time.Time
	demo    bool
}

// Store isolates projects by authenticated workspace and returns value copies.
// It deliberately has no persistence; restarting Acme resets the sample data.
type Store struct {
	mu         sync.RWMutex
	workspaces map[string]*workspace
}

// NewStore creates an empty process-local repository.
func NewStore() *Store {
	return &Store{workspaces: make(map[string]*workspace)}
}

// EnsureWorkspace creates a workspace and seeds it once. Expired demo workspaces
// are reclaimed on login; GitHub workspaces survive logout until process exit.
func (s *Store) EnsureWorkspace(namespace string, demo bool) error {
	if namespace == "" {
		return errors.New("workspace namespace is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.workspaces[namespace]; ok {
		return nil
	}
	now := time.Now().UTC()
	for key, ws := range s.workspaces {
		if ws.demo && now.Sub(ws.created) > 24*time.Hour {
			delete(s.workspaces, key)
		}
	}
	// Keep an explicitly enabled, unauthenticated demo login from growing memory
	// without a bound. Actual sessions expire sooner than the cleanup horizon.
	if len(s.workspaces) >= 256 {
		return errors.New("sample workspace capacity reached; try again later or restart the server")
	}
	ws := &workspace{
		projects: make(map[string]Project),
		// Reserve the creation page alongside allocated and deleted slugs.
		slugs:   map[string]string{"new": ""},
		created: now,
		demo:    demo,
	}
	for i, seed := range seeds {
		created := now.Add(-time.Duration(i+1) * 24 * time.Hour)
		project := Project{
			ID: rand.Text(), Name: seed.Name, Description: seed.Description,
			Status: seed.Status, CreatedAt: created, UpdatedAt: created.Add(2 * time.Hour),
		}
		project.Slug = ws.allocateSlug(project.Name, project.ID)
		ws.projects[project.ID] = project
	}
	s.workspaces[namespace] = ws
	return nil
}

// DeleteDemoWorkspace removes only a demo workspace, after its session ends.
func (s *Store) DeleteDemoWorkspace(namespace string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ws := s.workspaces[namespace]; ws != nil && ws.demo {
		delete(s.workspaces, namespace)
	}
}

// Get looks up a project only within the caller's authorized workspace.
func (s *Store) Get(namespace, id string) (Project, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ws := s.workspaces[namespace]
	if ws == nil {
		return Project{}, false
	}
	project, ok := ws.projects[id]
	return project, ok
}

// GetBySlug looks up a live project only within the caller's workspace.
func (s *Store) GetBySlug(namespace, slug string) (Project, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ws := s.workspaces[namespace]
	if ws == nil {
		return Project{}, false
	}
	id, ok := ws.slugs[slug]
	if !ok {
		return Project{}, false
	}
	project, ok := ws.projects[id]
	return project, ok
}

// allocateSlug runs while the store is locked, including initial seeding.
func (ws *workspace) allocateSlug(name, id string) string {
	var base strings.Builder
	separator := false
	for _, r := range strings.ToLower(name) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			if separator && base.Len() > 0 {
				base.WriteByte('-')
			}
			base.WriteRune(r)
			separator = false
		} else {
			separator = true
		}
	}
	prefix := base.String()
	if prefix == "" {
		prefix = "project"
	}
	slug := prefix
	for suffix := 2; ; suffix++ {
		if _, exists := ws.slugs[slug]; !exists {
			ws.slugs[slug] = id
			return slug
		}
		slug = prefix + "-" + strconv.Itoa(suffix)
	}
}

// List returns matching records in stable descending creation-time/ID order.
func (s *Store) List(namespace, search, status string) []Project {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Project, 0)
	ws := s.workspaces[namespace]
	if ws == nil {
		return result
	}
	search = strings.ToLower(strings.TrimSpace(search))
	for _, project := range ws.projects {
		if status != "" && project.Status != status {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(project.Name+" "+project.Description), search) {
			continue
		}
		result = append(result, project)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].CreatedAt.Equal(result[j].CreatedAt) {
			return result[i].ID > result[j].ID
		}
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})
	return result
}

// Create adds a validated project to the caller's workspace.
func (s *Store) Create(namespace string, input Input) (Project, error) {
	input, err := input.Validate()
	if err != nil {
		return Project{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.workspaces[namespace]
	if ws == nil {
		return Project{}, ErrNotFound
	}
	if len(ws.projects) >= MaxProjects {
		return Project{}, ErrCapacity
	}
	now := time.Now().UTC()
	project := Project{ID: rand.Text(), Name: input.Name, Description: input.Description, Status: input.Status, CreatedAt: now, UpdatedAt: now}
	project.Slug = ws.allocateSlug(project.Name, project.ID)
	ws.projects[project.ID] = project
	return project, nil
}

// Update changes only a record within the caller's workspace.
func (s *Store) Update(namespace, id string, input Input) (Project, error) {
	input, err := input.Validate()
	if err != nil {
		return Project{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.workspaces[namespace]
	if ws == nil {
		return Project{}, ErrNotFound
	}
	project, ok := ws.projects[id]
	if !ok {
		return Project{}, ErrNotFound
	}
	project.Name, project.Description, project.Status = input.Name, input.Description, input.Status
	project.UpdatedAt = time.Now().UTC()
	ws.projects[id] = project
	return project, nil
}

// Delete removes only a record within the caller's workspace.
func (s *Store) Delete(namespace, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.workspaces[namespace]
	if ws == nil {
		return ErrNotFound
	}
	if _, ok := ws.projects[id]; !ok {
		return ErrNotFound
	}
	delete(ws.projects, id)
	return nil
}

var seeds = []Input{
	{"Atlas design system", "A shared language for Acme products. Accessible components, thoughtful defaults, and a little less reinvention.", Active},
	{"Customer portal", "Give customers a clear home for their account, project activity, and everything they need from the team.", Active},
	{"Release pipeline", "Make shipping a predictable habit with reliable builds, useful checks, and a quieter release day.", Active},
	{"Documentation hub", "Bring product guides, integration notes, and practical examples together in one searchable place.", Planned},
	{"Workspace search", "Help people find the project, conversation, or decision they need without remembering where it lives.", Active},
	{"Usage analytics", "Turn product activity into useful signals for teams, with clear definitions and privacy-conscious defaults.", Planned},
	{"API gateway", "A consistent entry point for Acme services, with clear contracts and better visibility into requests.", Active},
	{"Mobile companion", "A focused mobile experience for checking progress and keeping up with the work that matters.", Planned},
	{"Brand refresh", "The foundations of our current visual identity: a quieter palette, stronger typography, and room to grow.", Archived},
	{"Legacy console", "The original administration experience, preserved as a reference while the new workspace takes over.", Archived},
}
