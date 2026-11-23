/**
 * @generated SignedSource<<9c81041740ee14a1e81a6e98d79f4333>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProjectEditPageQuery$variables = {
  slug: string;
};
export type ProjectEditPageQuery$data = {
  readonly project: {
    readonly id: string;
    readonly slug: string;
    readonly " $fragmentSpreads": FragmentRefs<"ProjectForm_project">;
  } | null | undefined;
};
export type ProjectEditPageQuery = {
  response: ProjectEditPageQuery$data;
  variables: ProjectEditPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "slug"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "slug",
    "variableName": "slug"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "ProjectEditPageQuery",
    "selections": [
      {
        "alias": "project",
        "args": (v1/*:: as any*/),
        "concreteType": "Project",
        "kind": "LinkedField",
        "name": "projectBySlug",
        "plural": false,
        "selections": [
          (v2/*:: as any*/),
          (v3/*:: as any*/),
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "ProjectForm_project"
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Operation",
    "name": "ProjectEditPageQuery",
    "selections": [
      {
        "alias": "project",
        "args": (v1/*:: as any*/),
        "concreteType": "Project",
        "kind": "LinkedField",
        "name": "projectBySlug",
        "plural": false,
        "selections": [
          (v2/*:: as any*/),
          (v3/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "name",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "description",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "status",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "97b483e1440f8ca078708fd8d8c90b9b",
    "id": null,
    "metadata": {},
    "name": "ProjectEditPageQuery",
    "operationKind": "query",
    "text": "query ProjectEditPageQuery(\n  $slug: String!\n) {\n  project: projectBySlug(slug: $slug) {\n    id\n    slug\n    ...ProjectForm_project\n  }\n}\n\nfragment ProjectForm_project on Project {\n  id\n  slug\n  name\n  description\n  status\n}\n"
  }
};
})();

(node as any).hash = "291609c736dd05c569635e2d44c83e0d";

export default node;
