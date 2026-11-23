/**
 * @generated SignedSource<<03679b6ccbf617315483c80d754cc68f>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "PLANNED" | "%future added value";
export type CreateProjectInput = {
  clientMutationId?: string | null | undefined;
  description: string;
  name: string;
  status: ProjectStatus;
};
export type ProjectFormCreateMutation$variables = {
  input: CreateProjectInput;
};
export type ProjectFormCreateMutation$data = {
  readonly createProject: {
    readonly project: {
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly " $fragmentSpreads": FragmentRefs<"ProjectForm_project">;
    };
  };
};
export type ProjectFormCreateMutation = {
  response: ProjectFormCreateMutation$data;
  variables: ProjectFormCreateMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "input"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "input",
    "variableName": "input"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v3 = {
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
    "name": "ProjectFormCreateMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "ProjectPayload",
        "kind": "LinkedField",
        "name": "createProject",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Project",
            "kind": "LinkedField",
            "name": "project",
            "plural": false,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "ProjectForm_project"
              },
              (v2/*:: as any*/),
              (v3/*:: as any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Operation",
    "name": "ProjectFormCreateMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "ProjectPayload",
        "kind": "LinkedField",
        "name": "createProject",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Project",
            "kind": "LinkedField",
            "name": "project",
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
                "name": "description",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "status",
                "storageKey": null
              },
              (v2/*:: as any*/),
              (v3/*:: as any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "180e839c882f6bdca69a9da119253174",
    "id": null,
    "metadata": {},
    "name": "ProjectFormCreateMutation",
    "operationKind": "mutation",
    "text": "mutation ProjectFormCreateMutation(\n  $input: CreateProjectInput!\n) {\n  createProject(input: $input) {\n    project {\n      ...ProjectForm_project\n      createdAt\n      updatedAt\n      id\n    }\n  }\n}\n\nfragment ProjectForm_project on Project {\n  id\n  slug\n  name\n  description\n  status\n}\n"
  }
};
})();

(node as any).hash = "e22cb54873c38cb3b49f7216f01b50b1";

export default node;
