/**
 * @generated SignedSource<<3c6a59773833160a9b31f5ae34502399>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type OverviewPageQuery$variables = Record<PropertyKey, never>;
export type OverviewPageQuery$data = {
  readonly projectStats: {
    readonly active: number;
    readonly archived: number;
    readonly planned: number;
    readonly total: number;
  };
  readonly projects: {
    readonly edges: ReadonlyArray<{
      readonly node: {
        readonly " $fragmentSpreads": FragmentRefs<"ProjectTable_project">;
      };
    }>;
  };
};
export type OverviewPageQuery = {
  response: OverviewPageQuery$data;
  variables: OverviewPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "concreteType": "ProjectStats",
  "kind": "LinkedField",
  "name": "projectStats",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "total",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "active",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "planned",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "archived",
      "storageKey": null
    }
  ],
  "storageKey": null
},
v1 = [
  {
    "kind": "Literal",
    "name": "first",
    "value": 5
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "OverviewPageQuery",
    "selections": [
      (v0/*:: as any*/),
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "ProjectConnection",
        "kind": "LinkedField",
        "name": "projects",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "ProjectEdge",
            "kind": "LinkedField",
            "name": "edges",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "Project",
                "kind": "LinkedField",
                "name": "node",
                "plural": false,
                "selections": [
                  {
                    "args": null,
                    "kind": "FragmentSpread",
                    "name": "ProjectTable_project"
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": "projects(first:5)"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "OverviewPageQuery",
    "selections": [
      (v0/*:: as any*/),
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "ProjectConnection",
        "kind": "LinkedField",
        "name": "projects",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "ProjectEdge",
            "kind": "LinkedField",
            "name": "edges",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "Project",
                "kind": "LinkedField",
                "name": "node",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "id",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "slug",
                    "storageKey": null
                  },
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
                    "name": "status",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "updatedAt",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": "projects(first:5)"
      }
    ]
  },
  "params": {
    "cacheID": "7b4a3b51584e304add90a087b9b624ab",
    "id": null,
    "metadata": {},
    "name": "OverviewPageQuery",
    "operationKind": "query",
    "text": "query OverviewPageQuery {\n  projectStats {\n    total\n    active\n    planned\n    archived\n  }\n  projects(first: 5) {\n    edges {\n      node {\n        ...ProjectTable_project\n        id\n      }\n    }\n  }\n}\n\nfragment ProjectTable_project on Project {\n  id\n  slug\n  name\n  status\n  updatedAt\n}\n"
  }
};
})();

(node as any).hash = "4094d321cf0c7b8d73a001436ed5e081";

export default node;
