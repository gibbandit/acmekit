package acme.authz

import rego.v1

default allow := false

same_workspace if {
    input.subject.authenticated
    input.subject.namespace != ""
    input.subject.namespace == input.resource.namespace
}

allow if {
    same_workspace
    input.subject.role in {"MAINTAINER", "MEMBER"}
    input.action == "project:read"
}

allow if {
    same_workspace
    input.subject.role == "MAINTAINER"
    input.action in {"project:create", "project:update", "project:delete"}
}
