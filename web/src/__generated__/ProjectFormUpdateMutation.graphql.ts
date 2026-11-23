/**
 * @generated SignedSource<<e7f5cc19062af9a7a1033aa951a1f078>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "PLANNED" | "%future added value";
export type UpdateProjectInput = {
  clientMutationId?: string | null | undefined;
  description: string;
  id: string;
  name: string;
  status: ProjectStatus;
};
export type ProjectFormUpdateMutation$variables = {
  input: UpdateProjectInput;
};
export type ProjectFormUpdateMutation$data = {
  readonly updateProject: {
    readonly project: {
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly " $fragmentSpreads": FragmentRefs<"ProjectForm_project">;
    };
  };
};
export type ProjectFormUpdateMutation = {
  response: ProjectFormUpdateMutation$data;
  variables: ProjectFormUpdateMutation$variables;
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
    "name": "ProjectFormUpdateMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "ProjectPayload",
        "kind": "LinkedField",
        "name": "updateProject",
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
    "name": "ProjectFormUpdateMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "ProjectPayload",
        "kind": "LinkedField",
        "name": "updateProject",
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
    "cacheID": "31b1d432fa860e04cdd53e8af44bb70e",
    "id": null,
    "metadata": {},
    "name": "ProjectFormUpdateMutation",
    "operationKind": "mutation",
    "text": "mutation ProjectFormUpdateMutation(\n  $input: UpdateProjectInput!\n) {\n  updateProject(input: $input) {\n    project {\n      ...ProjectForm_project\n      createdAt\n      updatedAt\n      id\n    }\n  }\n}\n\nfragment ProjectForm_project on Project {\n  id\n  slug\n  name\n  description\n  status\n}\n"
  }
};
})();

(node as any).hash = "d08c622d33b84fe84396b151851f4009";

export default node;
