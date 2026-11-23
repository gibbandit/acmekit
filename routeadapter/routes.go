package routeadapter

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

// Segment is the portable form of a native router path segment. A splat is
// terminal and may have a suffix spanning several URL segments.
type Segment struct {
	Kind   string `json:"kind"`
	Value  string `json:"value,omitempty"`
	Name   string `json:"name,omitempty"`
	Prefix string `json:"prefix,omitempty"`
	Suffix string `json:"suffix,omitempty"`
}

func validateRoute(route RouteShell, reserved []string) error {
	if !strings.HasPrefix(route.Pattern, "/") || strings.ContainsAny(route.Pattern, "\\?#\x00\r\n") ||
		strings.Contains(route.Pattern, "//") || route.RouteID == "" || route.Segments == nil {
		return fmt.Errorf("invalid frontend route %q", route.Pattern)
	}
	if hasPathNamespace(route.Pattern, reserved...) || hasPathNamespace(route.Pattern, "/assets", "/_routes", "/_shell.html", "/route-shells.json") {
		return fmt.Errorf("reserved frontend route pattern %q", route.Pattern)
	}
	for _, part := range strings.Split(route.Pattern, "/") {
		if part == "." || part == ".." {
			return fmt.Errorf("invalid frontend route %q", route.Pattern)
		}
	}
	names := make(map[string]bool)
	var pattern strings.Builder
	pattern.WriteString("^")
	for index, segment := range route.Segments {
		pattern.WriteString("/")
		switch segment.Kind {
		case "static":
			if segment.Value == "" || segment.Value == "." || segment.Value == ".." || strings.ContainsAny(segment.Value, "/\x00") ||
				segment.Name != "" || segment.Prefix != "" || segment.Suffix != "" {
				return fmt.Errorf("invalid static segment in frontend route %q", route.Pattern)
			}
			pattern.WriteString(regexp.QuoteMeta(segment.Value))
		case "param", "optional", "splat":
			if segment.Name == "" || strings.ContainsAny(segment.Name, "/{}\x00") || names[segment.Name] || segment.Value != "" ||
				strings.ContainsAny(segment.Prefix, "/\x00") || strings.ContainsRune(segment.Suffix, 0) ||
				(segment.Kind != "splat" && strings.Contains(segment.Suffix, "/")) ||
				(segment.Kind == "splat" && (index != len(route.Segments)-1 || segment.Name != "_splat")) {
				return fmt.Errorf("invalid parameter segment in frontend route %q", route.Pattern)
			}
			names[segment.Name] = true
			pattern.WriteString(regexp.QuoteMeta(segment.Prefix))
			switch segment.Kind {
			case "param":
				if segment.Prefix == "" && segment.Suffix == "" {
					pattern.WriteString("(?:" + regexp.QuoteMeta("$"+segment.Name) + "|" + regexp.QuoteMeta("{$"+segment.Name+"}") + ")")
				} else {
					pattern.WriteString(regexp.QuoteMeta("{$" + segment.Name + "}"))
				}
			case "optional":
				pattern.WriteString(regexp.QuoteMeta("{-$" + segment.Name + "}"))
			case "splat":
				if segment.Prefix == "" && segment.Suffix == "" {
					// A bare parent splat consumes child templates as well.
					pattern.WriteString(`(?:\$(?:/.*)?|\{\$\})`)
				} else {
					pattern.WriteString(`\{\$\}`)
				}
			}
			pattern.WriteString(regexp.QuoteMeta(segment.Suffix))
		default:
			return fmt.Errorf("unknown segment kind %q in frontend route %q", segment.Kind, route.Pattern)
		}
	}
	if len(route.Segments) == 0 || strings.HasSuffix(route.Pattern, "/") {
		pattern.WriteString("/")
	}
	pattern.WriteString("$")
	consistent, err := regexp.MatchString(pattern.String(), route.Pattern)
	if err != nil || !consistent {
		return fmt.Errorf("frontend route %q disagrees with its segments", route.Pattern)
	}
	return nil
}

type routeNode struct {
	segment  Segment
	depth    int
	static   map[string]*routeNode
	param    []*routeNode
	optional []*routeNode
	splat    []*routeNode
	index    *routeNode
	route    *RouteShell
	handler  http.Handler
}

func (root *routeNode) add(route RouteShell, handler http.Handler) error {
	node := root
	for _, segment := range route.Segments {
		if segment.Kind == "static" {
			if node.static == nil {
				node.static = make(map[string]*routeNode)
			}
			child := node.static[segment.Value]
			if child == nil {
				child = &routeNode{segment: segment, depth: node.depth + 1}
				node.static[segment.Value] = child
			}
			node = child
			continue
		}
		children := &node.param
		if segment.Kind == "optional" {
			children = &node.optional
		} else if segment.Kind == "splat" {
			children = &node.splat
		}
		var child *routeNode
		for _, candidate := range *children {
			if segment.Kind != "splat" && candidate.segment.Prefix == segment.Prefix && candidate.segment.Suffix == segment.Suffix {
				child = candidate
				break
			}
		}
		if child == nil {
			child = &routeNode{segment: segment, depth: node.depth + 1}
			*children = append(*children, child)
		}
		node = child
	}
	if strings.HasSuffix(route.Pattern, "/") {
		if node.index == nil {
			node.index = &routeNode{depth: node.depth + 1}
		}
		node = node.index
	}
	if node.route != nil {
		return fmt.Errorf("duplicate frontend route shape %q and %q", node.route.Pattern, route.Pattern)
	}
	node.route, node.handler = &route, handler
	return nil
}

func (node *routeNode) sort() {
	for _, children := range [][]*routeNode{node.param, node.optional, node.splat} {
		slices.SortStableFunc(children, func(a, b *routeNode) int {
			if a.segment.Prefix != b.segment.Prefix && a.segment.Prefix != "" && b.segment.Prefix != "" {
				if strings.HasPrefix(a.segment.Prefix, b.segment.Prefix) {
					return -1
				}
				if strings.HasPrefix(b.segment.Prefix, a.segment.Prefix) {
					return 1
				}
			}
			if a.segment.Suffix != b.segment.Suffix && a.segment.Suffix != "" && b.segment.Suffix != "" {
				if strings.HasSuffix(a.segment.Suffix, b.segment.Suffix) {
					return -1
				}
				if strings.HasSuffix(b.segment.Suffix, a.segment.Suffix) {
					return 1
				}
			}
			if (a.segment.Prefix != "") != (b.segment.Prefix != "") {
				if a.segment.Prefix != "" {
					return -1
				}
				return 1
			}
			if (a.segment.Suffix != "") != (b.segment.Suffix != "") {
				if a.segment.Suffix != "" {
					return -1
				}
				return 1
			}
			return 0
		})
		for _, child := range children {
			child.sort()
		}
	}
	for _, child := range node.static {
		child.sort()
	}
	if node.index != nil {
		node.index.sort()
	}
}

type routeMatch struct {
	*routeNode
	params   map[string]string
	ranks    []byte
	captures []*string
	index    bool
}

// Prefer earlier static positions, then required positions, then consumed
// optional positions. The trie traversal breaks otherwise equal matches.
func (candidate *routeMatch) moreSpecific(best *routeMatch) bool {
	if best == nil {
		return true
	}
	for rank := byte(3); rank > 0; rank-- {
		for index := range candidate.ranks {
			a, b := candidate.ranks[index] == rank, best.ranks[index] == rank
			if a != b {
				return a
			}
		}
	}
	if candidate.index != best.index {
		return candidate.index
	}
	return candidate.depth > best.depth
}

func (root *routeNode) match(path string) *routeMatch {
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if path == "/" {
		parts = nil
	}
	ranks := make([]byte, len(parts))
	var best *routeMatch
	var visit func(*routeNode, int, []*string, bool)
	visit = func(node *routeNode, position int, captures []*string, index bool) {
		if position == len(parts) && node.route != nil {
			candidate := &routeMatch{routeNode: node, ranks: ranks, captures: captures, index: index}
			if candidate.moreSpecific(best) {
				candidate.ranks = slices.Clone(ranks)
				candidate.captures = slices.Clone(captures)
				best = candidate
			}
		}
		if position == len(parts) && node.index != nil {
			visit(node.index, position, captures, true)
		}
		if position < len(parts) {
			part := parts[position]
			if child := node.static[part]; child != nil {
				ranks[position] = 3
				visit(child, position+1, append(captures, nil), false)
				ranks[position] = 0
			}
			for _, children := range [][]*routeNode{node.param, node.optional} {
				for _, child := range children {
					segment := child.segment
					if part == "" || !strings.HasPrefix(part, segment.Prefix) || !strings.HasSuffix(part, segment.Suffix) || len(part) < len(segment.Prefix)+len(segment.Suffix) {
						continue
					}
					value := part[len(segment.Prefix) : len(part)-len(segment.Suffix)]
					capture := &value
					ranks[position] = 2
					if segment.Kind == "optional" {
						ranks[position] = 1
						if value == "" {
							capture = nil
						}
					}
					visit(child, position+1, append(captures, capture), false)
					ranks[position] = 0
				}
			}
		}
		for _, child := range node.optional {
			visit(child, position, append(captures, nil), false)
		}
		rest := strings.Join(parts[position:], "/")
		for _, child := range node.splat {
			segment := child.segment
			if (position == len(parts) && (segment.Prefix != "" || segment.Suffix != "")) || !strings.HasPrefix(rest, segment.Prefix) || !strings.HasSuffix(rest, segment.Suffix) || len(rest) < len(segment.Prefix)+len(segment.Suffix) {
				continue
			}
			value := rest[len(segment.Prefix) : len(rest)-len(segment.Suffix)]
			visit(child, len(parts), append(captures, &value), false)
		}
	}
	visit(root, 0, nil, false)
	if best == nil {
		return nil
	}
	best.params = make(map[string]string)
	for index, segment := range best.route.Segments {
		capture := best.captures[index]
		if capture == nil {
			continue
		}
		value, err := url.PathUnescape(*capture)
		if err != nil || !utf8.ValidString(value) {
			return nil
		}
		best.params[segment.Name] = value
		if segment.Kind == "splat" {
			best.params["*"] = value
		}
	}
	return best
}

type pathParamsKey struct{}

func withPathParams(ctx context.Context, params map[string]string) context.Context {
	return context.WithValue(ctx, pathParamsKey{}, params)
}

func pathParams(r *http.Request) map[string]string {
	params, _ := r.Context().Value(pathParamsKey{}).(map[string]string)
	return params
}
