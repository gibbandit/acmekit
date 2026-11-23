/**
 * @generated SignedSource<<5ae234178ebbdc67ebb8cf0263474444>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type WorkspaceQuery$variables = Record<PropertyKey, never>;
export type WorkspaceQuery$data = {
  readonly serverInfo: {
    readonly demoEnabled: boolean;
    readonly githubEnabled: boolean;
  };
  readonly viewer: {
    readonly canManageProjects: boolean;
    readonly " $fragmentSpreads": FragmentRefs<"AppSidebar_viewer">;
  } | null | undefined;
};
export type WorkspaceQuery = {
  response: WorkspaceQuery$data;
  variables: WorkspaceQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "canManageProjects",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "concreteType": "ServerInfo",
  "kind": "LinkedField",
  "name": "serverInfo",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "demoEnabled",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "githubEnabled",
      "storageKey": null
    }
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "WorkspaceQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          (v0/*:: as any*/),
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "AppSidebar_viewer"
          }
        ],
        "storageKey": null
      },
      (v1/*:: as any*/)
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "WorkspaceQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          (v0/*:: as any*/),
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
            "name": "role",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "avatarUrl",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      (v1/*:: as any*/)
    ]
  },
  "params": {
    "cacheID": "e36339541b3577e4fbb6ddd522797e75",
    "id": null,
    "metadata": {},
    "name": "WorkspaceQuery",
    "operationKind": "query",
    "text": "query WorkspaceQuery {\n  viewer {\n    canManageProjects\n    ...AppSidebar_viewer\n    id\n  }\n  serverInfo {\n    demoEnabled\n    githubEnabled\n  }\n}\n\nfragment AppSidebar_viewer on User {\n  ...accountMenu_viewer\n}\n\nfragment accountMenu_viewer on User {\n  name\n  role\n  avatarUrl\n}\n"
  }
};
})();

(node as any).hash = "ff52caa0e9ca10ffc38b6f6abc46873d";

export default node;
