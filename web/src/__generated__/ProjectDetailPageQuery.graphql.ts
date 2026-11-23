/**
 * @generated SignedSource<<ef861037ef87a1bd1361711faa192a8b>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "PLANNED" | "%future added value";
export type ProjectDetailPageQuery$variables = {
  slug: string;
};
export type ProjectDetailPageQuery$data = {
  readonly project: {
    readonly createdAt: string;
    readonly description: string;
    readonly name: string;
    readonly slug: string;
    readonly status: ProjectStatus;
    readonly updatedAt: string;
    readonly " $fragmentSpreads": FragmentRefs<"DeleteProjectDialog_project">;
  } | null | undefined;
};
export type ProjectDetailPageQuery = {
  response: ProjectDetailPageQuery$data;
  variables: ProjectDetailPageQuery$variables;
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
  "name": "slug",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "status",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "updatedAt",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "ProjectDetailPageQuery",
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
          (v4/*:: as any*/),
          (v5/*:: as any*/),
          (v6/*:: as any*/),
          (v7/*:: as any*/),
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "DeleteProjectDialog_project"
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
    "name": "ProjectDetailPageQuery",
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
          (v4/*:: as any*/),
          (v5/*:: as any*/),
          (v6/*:: as any*/),
          (v7/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "838ad1340a402b5ce73855e3365eda69",
    "id": null,
    "metadata": {},
    "name": "ProjectDetailPageQuery",
    "operationKind": "query",
    "text": "query ProjectDetailPageQuery(\n  $slug: String!\n) {\n  project: projectBySlug(slug: $slug) {\n    slug\n    name\n    description\n    status\n    createdAt\n    updatedAt\n    ...DeleteProjectDialog_project\n    id\n  }\n}\n\nfragment DeleteProjectDialog_project on Project {\n  id\n  name\n}\n"
  }
};
})();

(node as any).hash = "7c6084b735a447b4a06d5ce88dd9ef19";

export default node;
