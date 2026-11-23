package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/gibbandit/acmekit/internal/projects"
)

func encodeID(kind, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(kind + ":" + id))
}

func decodeID(value string) (string, string, error) {
	if len(value) == 0 || len(value) > 256 {
		return "", "", badInput("This ID is not valid.")
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", "", badInput("This ID is not valid.")
	}
	kind, id, found := strings.Cut(string(data), ":")
	if !found || (kind != "User" && kind != "Project") || len(id) == 0 || len(id) > 128 {
		return "", "", badInput("This ID is not valid.")
	}
	for _, r := range id {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			return "", "", badInput("This ID is not valid.")
		}
	}
	return kind, id, nil
}

type pageCursor struct {
	Version   int    `json:"v"`
	Timestamp int64  `json:"t"`
	ID        string `json:"i"`
	Scope     string `json:"s"`
}

func cursorScope(namespace, search, status string) string {
	sum := sha256.Sum256([]byte(namespace + "\x00" + search + "\x00" + status))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (s *server) encodeCursor(project projects.Project, scope string) string {
	data, _ := json.Marshal(pageCursor{Version: 1, Timestamp: project.CreatedAt.UnixNano(), ID: project.ID, Scope: scope})
	mac := hmac.New(sha256.New, s.cursorKey[:])
	_, _ = mac.Write(data)
	return base64.RawURLEncoding.EncodeToString(data) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *server) decodeCursor(value, scope string) (*pageCursor, error) {
	invalid := func() (*pageCursor, error) {
		return nil, badInput("This page cursor is invalid for the current workspace or filters. Start from the first page.")
	}
	if len(value) > 1024 {
		return invalid()
	}
	encoded, signature, found := strings.Cut(value, ".")
	if !found {
		return invalid()
	}
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return invalid()
	}
	sig, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return invalid()
	}
	mac := hmac.New(sha256.New, s.cursorKey[:])
	_, _ = mac.Write(data)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return invalid()
	}
	var cursor pageCursor
	if err := json.Unmarshal(data, &cursor); err != nil || cursor.Version != 1 || cursor.Timestamp <= 0 || cursor.ID == "" || cursor.Scope != scope {
		return invalid()
	}
	return &cursor, nil
}

func (s *server) projectConnection(namespace string, first int, after, anchor, search, status string) (map[string]any, error) {
	scope := cursorScope(namespace, search, status)
	var cursor *pageCursor
	for _, value := range []string{anchor, after} {
		if value == "" {
			continue
		}
		candidate, err := s.decodeCursor(value, scope)
		if err != nil {
			return nil, err
		}
		// The anchor fixes the window's lower bound; pagination can only advance it.
		if cursor == nil || candidate.Timestamp < cursor.Timestamp ||
			(candidate.Timestamp == cursor.Timestamp && candidate.ID < cursor.ID) {
			cursor = candidate
		}
	}
	all := s.projects.List(namespace, search, status)
	remaining := make([]projects.Project, 0, len(all))
	skipped := 0
	for _, project := range all {
		if cursor != nil && (project.CreatedAt.UnixNano() > cursor.Timestamp || (project.CreatedAt.UnixNano() == cursor.Timestamp && project.ID >= cursor.ID)) {
			skipped++
			continue
		}
		remaining = append(remaining, project)
	}
	hasNext := len(remaining) > first
	if len(remaining) > first {
		remaining = remaining[:first]
	}
	edges := make([]map[string]any, 0, len(remaining))
	var start, end any
	for _, project := range remaining {
		encoded := s.encodeCursor(project, scope)
		if start == nil {
			start = encoded
		}
		end = encoded
		edges = append(edges, map[string]any{"cursor": encoded, "node": projectValue(project)})
	}
	return map[string]any{
		"edges":      edges,
		"totalCount": len(all),
		"pageInfo":   map[string]any{"hasNextPage": hasNext, "hasPreviousPage": skipped > 0, "startCursor": start, "endCursor": end},
	}, nil
}
