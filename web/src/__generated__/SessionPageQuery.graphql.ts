/**
 * @generated SignedSource<<45701193473410ec0cfd3d11c247db41>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type SessionPageQuery$variables = Record<PropertyKey, never>;
export type SessionPageQuery$data = {
  readonly serverInfo: {
    readonly " $fragmentSpreads": FragmentRefs<"SessionPage_serverInfo">;
  };
  readonly viewer: {
    readonly " $fragmentSpreads": FragmentRefs<"SessionPage_viewer">;
  } | null | undefined;
};
export type SessionPageQuery = {
  response: SessionPageQuery$data;
  variables: SessionPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "SessionPageQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "SessionPage_viewer"
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "ServerInfo",
        "kind": "LinkedField",
        "name": "serverInfo",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "SessionPage_serverInfo"
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
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "SessionPageQuery",
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
            "name": "canManageProjects",
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
      {
        "alias": null,
        "args": null,
        "concreteType": "ServerInfo",
        "kind": "LinkedField",
        "name": "serverInfo",
        "plural": false,
        "selections": [
          (v0/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "version",
            "storageKey": null
          },
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
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "storage",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "546c9c280a32c4dd1e021d95212c9e02",
    "id": null,
    "metadata": {},
    "name": "SessionPageQuery",
    "operationKind": "query",
    "text": "query SessionPageQuery {\n  viewer {\n    ...SessionPage_viewer\n    id\n  }\n  serverInfo {\n    ...SessionPage_serverInfo\n  }\n}\n\nfragment SessionPage_serverInfo on ServerInfo {\n  name\n  version\n  demoEnabled\n  githubEnabled\n  storage\n}\n\nfragment SessionPage_viewer on User {\n  name\n  role\n  avatarUrl\n  canManageProjects\n}\n"
  }
};
})();

(node as any).hash = "6e7cff5b9f3077f6eeda51c794d1443a";

export default node;
