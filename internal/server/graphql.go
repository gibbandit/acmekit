package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gibbandit/acmekit/internal/authz"
	"github.com/gibbandit/acmekit/internal/projects"
	"github.com/graphql-go/graphql"
	"github.com/graphql-go/graphql/gqlerrors"
)

type graphError struct {
	code    string
	message string
}

func (e *graphError) Error() string { return e.message }
func (e *graphError) Extensions() map[string]interface{} {
	return map[string]interface{}{"code": e.code}
}

func badInput(message string) error { return &graphError{code: "BAD_USER_INPUT", message: message} }

func (s *server) requireAccess(ctx context.Context, action string) (*principal, error) {
	user := currentUser(ctx)
	if user == nil {
		return nil, &graphError{code: "UNAUTHENTICATED", message: "Sign in to continue."}
	}
	allowed, err := s.policy.Allow(ctx, authz.Subject{Role: user.Role, Namespace: user.Namespace}, action, user.Namespace)
	if err != nil {
		s.log.Error("authorization evaluation failed", "error", err)
		return nil, &graphError{code: "INTERNAL_ERROR", message: "Unable to check access. Please try again."}
	}
	if !allowed {
		return nil, &graphError{code: "FORBIDDEN", message: "Your role can view projects, but cannot change them."}
	}
	return user, nil
}

func (s *server) viewer(ctx context.Context) (any, error) {
	user := currentUser(ctx)
	if user == nil {
		return nil, nil
	}
	canManage, err := s.policy.Allow(ctx, authz.Subject{Role: user.Role, Namespace: user.Namespace}, "project:create", user.Namespace)
	if err != nil {
		return nil, &graphError{code: "INTERNAL_ERROR", message: "Unable to check access. Please try again."}
	}
	var avatar any
	if user.AvatarURL != "" {
		avatar = user.AvatarURL
	}
	return map[string]any{
		"__typename": "User", "id": encodeID("User", user.ID), "name": user.Name,
		"role": user.Role, "avatarUrl": avatar, "canManageProjects": canManage,
	}, nil
}

// buildSchema authors the public contract explicitly. The matching schema.graphql
// is consumed by Relay's compiler; storage records never generate the API.
func (s *server) buildSchema() (graphql.Schema, error) {
	var userType, projectType *graphql.Object
	nodeType := graphql.NewInterface(graphql.InterfaceConfig{
		Name:   "Node",
		Fields: graphql.Fields{"id": &graphql.Field{Type: graphql.NewNonNull(graphql.ID)}},
		ResolveType: func(p graphql.ResolveTypeParams) *graphql.Object {
			value, _ := p.Value.(map[string]any)
			switch value["__typename"] {
			case "User":
				return userType
			case "Project":
				return projectType
			default:
				return nil
			}
		},
	})
	roleType := graphql.NewEnum(graphql.EnumConfig{Name: "Role", Values: graphql.EnumValueConfigMap{
		"MAINTAINER": &graphql.EnumValueConfig{Value: "MAINTAINER"},
		"MEMBER":     &graphql.EnumValueConfig{Value: "MEMBER"},
	}})
	statusType := graphql.NewEnum(graphql.EnumConfig{Name: "ProjectStatus", Values: graphql.EnumValueConfigMap{
		"ACTIVE":   &graphql.EnumValueConfig{Value: projects.Active},
		"PLANNED":  &graphql.EnumValueConfig{Value: projects.Planned},
		"ARCHIVED": &graphql.EnumValueConfig{Value: projects.Archived},
	}})
	userType = graphql.NewObject(graphql.ObjectConfig{
		Name: "User", Interfaces: []*graphql.Interface{nodeType},
		Fields: graphql.Fields{
			"id":                &graphql.Field{Type: graphql.NewNonNull(graphql.ID)},
			"name":              &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"role":              &graphql.Field{Type: graphql.NewNonNull(roleType)},
			"avatarUrl":         &graphql.Field{Type: graphql.String},
			"canManageProjects": &graphql.Field{Type: graphql.NewNonNull(graphql.Boolean)},
		},
	})
	projectType = graphql.NewObject(graphql.ObjectConfig{
		Name: "Project", Interfaces: []*graphql.Interface{nodeType},
		Fields: graphql.Fields{
			"id":          &graphql.Field{Type: graphql.NewNonNull(graphql.ID)},
			"slug":        &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"name":        &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"description": &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"status":      &graphql.Field{Type: graphql.NewNonNull(statusType)},
			"createdAt":   &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"updatedAt":   &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
		},
	})
	edgeType := graphql.NewObject(graphql.ObjectConfig{Name: "ProjectEdge", Fields: graphql.Fields{
		"cursor": &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
		"node":   &graphql.Field{Type: graphql.NewNonNull(projectType)},
	}})
	pageInfoType := graphql.NewObject(graphql.ObjectConfig{Name: "PageInfo", Fields: graphql.Fields{
		"hasNextPage":     &graphql.Field{Type: graphql.NewNonNull(graphql.Boolean)},
		"hasPreviousPage": &graphql.Field{Type: graphql.NewNonNull(graphql.Boolean)},
		"startCursor":     &graphql.Field{Type: graphql.String},
		"endCursor":       &graphql.Field{Type: graphql.String},
	}})
	connectionType := graphql.NewObject(graphql.ObjectConfig{Name: "ProjectConnection", Fields: graphql.Fields{
		"edges":      &graphql.Field{Type: graphql.NewNonNull(graphql.NewList(graphql.NewNonNull(edgeType)))},
		"pageInfo":   &graphql.Field{Type: graphql.NewNonNull(pageInfoType)},
		"totalCount": &graphql.Field{Type: graphql.NewNonNull(graphql.Int)},
	}})
	statsType := graphql.NewObject(graphql.ObjectConfig{Name: "ProjectStats", Fields: graphql.Fields{
		"total":    &graphql.Field{Type: graphql.NewNonNull(graphql.Int)},
		"active":   &graphql.Field{Type: graphql.NewNonNull(graphql.Int)},
		"planned":  &graphql.Field{Type: graphql.NewNonNull(graphql.Int)},
		"archived": &graphql.Field{Type: graphql.NewNonNull(graphql.Int)},
	}})
	serverInfoType := graphql.NewObject(graphql.ObjectConfig{Name: "ServerInfo", Fields: graphql.Fields{
		"name":          &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
		"version":       &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
		"demoEnabled":   &graphql.Field{Type: graphql.NewNonNull(graphql.Boolean)},
		"githubEnabled": &graphql.Field{Type: graphql.NewNonNull(graphql.Boolean)},
		"storage":       &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
	}})
	query := graphql.NewObject(graphql.ObjectConfig{Name: "Query", Fields: graphql.Fields{
		"viewer": &graphql.Field{Type: userType, Resolve: func(p graphql.ResolveParams) (interface{}, error) {
			return s.viewer(p.Context)
		}},
		"node": &graphql.Field{Type: nodeType, Args: graphql.FieldConfigArgument{
			"id": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.ID)},
		}, Resolve: func(p graphql.ResolveParams) (interface{}, error) {
			user, err := s.requireAccess(p.Context, "project:read")
			if err != nil {
				return nil, err
			}
			kind, id, err := decodeID(p.Args["id"].(string))
			if err != nil {
				return nil, err
			}
			if kind == "User" {
				if id != user.ID {
					return nil, nil
				}
				return s.viewer(p.Context)
			}
			project, ok := s.projects.Get(user.Namespace, id)
			if !ok {
				return nil, nil
			}
			return projectValue(project), nil
		}},
		"project": &graphql.Field{Type: projectType, Args: graphql.FieldConfigArgument{
			"id": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.ID)},
		}, Resolve: func(p graphql.ResolveParams) (interface{}, error) {
			user, err := s.requireAccess(p.Context, "project:read")
			if err != nil {
				return nil, err
			}
			kind, id, err := decodeID(p.Args["id"].(string))
			if err != nil {
				return nil, err
			}
			if kind != "Project" {
				return nil, badInput("Use a project ID.")
			}
			project, ok := s.projects.Get(user.Namespace, id)
			if !ok {
				return nil, nil
			}
			return projectValue(project), nil
		}},
		"projectBySlug": &graphql.Field{Type: projectType, Args: graphql.FieldConfigArgument{
			"slug": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.String)},
		}, Resolve: func(p graphql.ResolveParams) (interface{}, error) {
			user, err := s.requireAccess(p.Context, "project:read")
			if err != nil {
				return nil, err
			}
			slug := p.Args["slug"].(string)
			project, ok := s.projects.GetBySlug(user.Namespace, slug)
			if !ok {
				// Accept Relay project IDs as a fallback. Unrecognized slugs return null.
				kind, id, err := decodeID(slug)
				if err != nil || kind != "Project" {
					return nil, nil
				}
				project, ok = s.projects.Get(user.Namespace, id)
			}
			if !ok {
				return nil, nil
			}
			return projectValue(project), nil
		}},
		"projects": &graphql.Field{Type: graphql.NewNonNull(connectionType), Args: graphql.FieldConfigArgument{
			"first":  &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 6},
			"after":  &graphql.ArgumentConfig{Type: graphql.String},
			"anchor": &graphql.ArgumentConfig{Type: graphql.String},
			"search": &graphql.ArgumentConfig{Type: graphql.String},
			"status": &graphql.ArgumentConfig{Type: statusType},
		}, Resolve: s.resolveProjects},
		"projectStats": &graphql.Field{Type: graphql.NewNonNull(statsType), Resolve: func(p graphql.ResolveParams) (interface{}, error) {
			user, err := s.requireAccess(p.Context, "project:read")
			if err != nil {
				return nil, err
			}
			all := s.projects.List(user.Namespace, "", "")
			stats := map[string]int{"total": len(all), "active": 0, "planned": 0, "archived": 0}
			for _, project := range all {
				stats[strings.ToLower(project.Status)]++
			}
			return stats, nil
		}},
		"serverInfo": &graphql.Field{Type: graphql.NewNonNull(serverInfoType), Resolve: func(_ graphql.ResolveParams) (interface{}, error) {
			return map[string]any{"name": "Acme", "version": s.config.Version, "demoEnabled": s.config.DemoMode, "githubEnabled": s.oauth != nil, "storage": "memory"}, nil
		}},
	}})
	inputFields := func(withID bool) graphql.InputObjectConfigFieldMap {
		fields := graphql.InputObjectConfigFieldMap{
			"name":             &graphql.InputObjectFieldConfig{Type: graphql.NewNonNull(graphql.String)},
			"description":      &graphql.InputObjectFieldConfig{Type: graphql.NewNonNull(graphql.String)},
			"status":           &graphql.InputObjectFieldConfig{Type: graphql.NewNonNull(statusType)},
			"clientMutationId": &graphql.InputObjectFieldConfig{Type: graphql.String},
		}
		if withID {
			fields["id"] = &graphql.InputObjectFieldConfig{Type: graphql.NewNonNull(graphql.ID)}
		}
		return fields
	}
	createInput := graphql.NewInputObject(graphql.InputObjectConfig{Name: "CreateProjectInput", Fields: inputFields(false)})
	updateInput := graphql.NewInputObject(graphql.InputObjectConfig{Name: "UpdateProjectInput", Fields: inputFields(true)})
	deleteInput := graphql.NewInputObject(graphql.InputObjectConfig{Name: "DeleteProjectInput", Fields: graphql.InputObjectConfigFieldMap{
		"id":               &graphql.InputObjectFieldConfig{Type: graphql.NewNonNull(graphql.ID)},
		"clientMutationId": &graphql.InputObjectFieldConfig{Type: graphql.String},
	}})
	payloadType := graphql.NewObject(graphql.ObjectConfig{Name: "ProjectPayload", Fields: graphql.Fields{
		"project":          &graphql.Field{Type: graphql.NewNonNull(projectType)},
		"clientMutationId": &graphql.Field{Type: graphql.String},
	}})
	deletePayloadType := graphql.NewObject(graphql.ObjectConfig{Name: "DeleteProjectPayload", Fields: graphql.Fields{
		"deletedProjectId": &graphql.Field{Type: graphql.NewNonNull(graphql.ID)},
		"clientMutationId": &graphql.Field{Type: graphql.String},
	}})
	mutation := graphql.NewObject(graphql.ObjectConfig{Name: "Mutation", Fields: graphql.Fields{
		"createProject": &graphql.Field{Type: graphql.NewNonNull(payloadType), Args: graphql.FieldConfigArgument{
			"input": &graphql.ArgumentConfig{Type: graphql.NewNonNull(createInput)},
		}, Resolve: s.resolveCreate},
		"updateProject": &graphql.Field{Type: graphql.NewNonNull(payloadType), Args: graphql.FieldConfigArgument{
			"input": &graphql.ArgumentConfig{Type: graphql.NewNonNull(updateInput)},
		}, Resolve: s.resolveUpdate},
		"deleteProject": &graphql.Field{Type: graphql.NewNonNull(deletePayloadType), Args: graphql.FieldConfigArgument{
			"input": &graphql.ArgumentConfig{Type: graphql.NewNonNull(deleteInput)},
		}, Resolve: s.resolveDelete},
	}})
	return graphql.NewSchema(graphql.SchemaConfig{Query: query, Mutation: mutation, Types: []graphql.Type{userType, projectType}})
}

func projectValue(project projects.Project) map[string]any {
	return map[string]any{
		"__typename": "Project", "id": encodeID("Project", project.ID), "slug": project.Slug, "name": project.Name,
		"description": project.Description, "status": project.Status,
		"createdAt": project.CreatedAt.Format(time.RFC3339Nano), "updatedAt": project.UpdatedAt.Format(time.RFC3339Nano),
	}
}

func mutationInput(p graphql.ResolveParams) (map[string]interface{}, projects.Input, error) {
	input := p.Args["input"].(map[string]interface{})
	if value, ok := input["clientMutationId"].(string); ok && len(value) > 128 {
		return nil, projects.Input{}, badInput("clientMutationId is too long.")
	}
	name, _ := input["name"].(string)
	description, _ := input["description"].(string)
	status, _ := input["status"].(string)
	validated, err := (projects.Input{Name: name, Description: description, Status: status}).Validate()
	if err != nil {
		return nil, projects.Input{}, badInput(err.Error())
	}
	return input, validated, nil
}

func (s *server) resolveCreate(p graphql.ResolveParams) (interface{}, error) {
	user, err := s.requireAccess(p.Context, "project:create")
	if err != nil {
		return nil, err
	}
	input, values, err := mutationInput(p)
	if err != nil {
		return nil, err
	}
	project, err := s.projects.Create(user.Namespace, values)
	if err != nil {
		return nil, repositoryError(err)
	}
	return map[string]any{"project": projectValue(project), "clientMutationId": input["clientMutationId"]}, nil
}

func (s *server) resolveUpdate(p graphql.ResolveParams) (interface{}, error) {
	user, err := s.requireAccess(p.Context, "project:update")
	if err != nil {
		return nil, err
	}
	input, values, err := mutationInput(p)
	if err != nil {
		return nil, err
	}
	kind, id, err := decodeID(input["id"].(string))
	if err != nil {
		return nil, err
	}
	if kind != "Project" {
		return nil, badInput("Use a project ID.")
	}
	project, err := s.projects.Update(user.Namespace, id, values)
	if err != nil {
		return nil, repositoryError(err)
	}
	return map[string]any{"project": projectValue(project), "clientMutationId": input["clientMutationId"]}, nil
}

func (s *server) resolveDelete(p graphql.ResolveParams) (interface{}, error) {
	user, err := s.requireAccess(p.Context, "project:delete")
	if err != nil {
		return nil, err
	}
	input := p.Args["input"].(map[string]interface{})
	if value, ok := input["clientMutationId"].(string); ok && len(value) > 128 {
		return nil, badInput("clientMutationId is too long.")
	}
	globalID := input["id"].(string)
	kind, id, err := decodeID(globalID)
	if err != nil {
		return nil, err
	}
	if kind != "Project" {
		return nil, badInput("Use a project ID.")
	}
	if err := s.projects.Delete(user.Namespace, id); err != nil {
		return nil, repositoryError(err)
	}
	return map[string]any{"deletedProjectId": globalID, "clientMutationId": input["clientMutationId"]}, nil
}

func repositoryError(err error) error {
	if errors.Is(err, projects.ErrNotFound) {
		return &graphError{code: "NOT_FOUND", message: "This project is not available in your workspace."}
	}
	if errors.Is(err, projects.ErrCapacity) {
		return badInput(err.Error())
	}
	return &graphError{code: "INTERNAL_ERROR", message: "Unable to save the project. Please try again."}
}

func (s *server) serveGraphQL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	var request struct {
		ID            string                 `json:"id"`
		Query         string                 `json:"query"`
		OperationName string                 `json:"operationName"`
		Variables     map[string]interface{} `json:"variables"`
		Extensions    map[string]interface{} `json:"extensions"`
	}
	if !decodeJSON(w, r, &request, 128<<10) {
		return
	}
	if request.ID != "" {
		operation, ok := s.operations[request.ID]
		if !ok {
			writeGraphQLError(w, http.StatusBadRequest, "UNKNOWN_OPERATION", "Unknown persisted operation.")
			return
		}
		if request.Query != "" {
			writeGraphQLError(w, http.StatusBadRequest, "BAD_QUERY", "Provide either an operation ID or query text.")
			return
		}
		request.Query = operation.document
	}
	result, status := s.executeGraphQL(r.Context(), request.Query, request.OperationName, request.Variables)
	writeJSON(w, status, result)
}

func (s *server) executeGraphQL(ctx context.Context, query, operationName string, variables map[string]any) (*graphql.Result, int) {
	if strings.TrimSpace(query) == "" || len(query) > 32<<10 || len(operationName) > 128 {
		return graphFailure("BAD_QUERY", "Provide a GraphQL query of at most 32 KiB."), http.StatusBadRequest
	}
	if err := checkQueryLimits(query); err != nil {
		return graphFailure("BAD_QUERY", err.Error()), http.StatusBadRequest
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	result := graphql.Do(graphql.Params{
		Schema: s.schema, RequestString: query, OperationName: operationName,
		VariableValues: variables, Context: ctx,
	})
	if ctx.Err() != nil {
		return graphFailure("TIMEOUT", "The request timed out. Please try again."), http.StatusGatewayTimeout
	}
	for index, failure := range result.Errors {
		// Native request/validation errors have no response path. Resolver
		// failures are located, including panics caught inside graphql-go.
		if len(failure.Path) == 0 {
			continue
		}
		cause := failure.OriginalError()
		if located, ok := cause.(*gqlerrors.Error); ok {
			cause = located.OriginalError
		}
		var expected *graphError
		if errors.As(cause, &expected) {
			failure.Message = expected.message
			failure.Extensions = expected.Extensions()
			result.Errors[index] = failure
			continue
		}
		s.log.Error("GraphQL resolver failed", "operation", operationName, "path", failure.Path, "error", failure.OriginalError())
		failure.Message = "Something went wrong. Please try again."
		failure.Extensions = map[string]any{"code": "INTERNAL_ERROR"}
		result.Errors[index] = failure
	}
	return result, http.StatusOK
}

func graphFailure(code, message string) *graphql.Result {
	failure := gqlerrors.NewFormattedError(message)
	failure.Extensions = map[string]any{"code": code}
	return &graphql.Result{Errors: []gqlerrors.FormattedError{failure}}
}

func writeGraphQLError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, graphFailure(code, message))
}

func (s *server) resolveProjects(p graphql.ResolveParams) (interface{}, error) {
	user, err := s.requireAccess(p.Context, "project:read")
	if err != nil {
		return nil, err
	}
	first := 6
	if value, ok := p.Args["first"].(int); ok {
		first = value
	}
	if first < 0 || first > 50 {
		return nil, badInput("first must be between 0 and 50.")
	}
	search, _ := p.Args["search"].(string)
	search = strings.ToLower(strings.TrimSpace(search))
	if utf8.RuneCountInString(search) > 200 {
		return nil, badInput("Search must contain at most 200 characters.")
	}
	status, _ := p.Args["status"].(string)
	if status != "" && !projects.ValidStatus(status) {
		return nil, badInput("Choose a valid project status.")
	}
	after, _ := p.Args["after"].(string)
	anchor, _ := p.Args["anchor"].(string)
	return s.projectConnection(user.Namespace, first, after, anchor, search, status)
}
