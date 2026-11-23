/**
 * @generated SignedSource<<eb5d44ac79a9d4e4c85de7bf7a876993>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type DeleteProjectInput = {
  clientMutationId?: string | null | undefined;
  id: string;
};
export type DeleteProjectDialogMutation$variables = {
  input: DeleteProjectInput;
};
export type DeleteProjectDialogMutation$data = {
  readonly deleteProject: {
    readonly deletedProjectId: string;
  };
};
export type DeleteProjectDialogMutation = {
  response: DeleteProjectDialogMutation$data;
  variables: DeleteProjectDialogMutation$variables;
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
  "name": "deletedProjectId",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DeleteProjectDialogMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "DeleteProjectPayload",
        "kind": "LinkedField",
        "name": "deleteProject",
        "plural": false,
        "selections": [
          (v2/*:: as any*/)
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
    "name": "DeleteProjectDialogMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*:: as any*/),
        "concreteType": "DeleteProjectPayload",
        "kind": "LinkedField",
        "name": "deleteProject",
        "plural": false,
        "selections": [
          (v2/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "filters": null,
            "handle": "deleteRecord",
            "key": "",
            "kind": "ScalarHandle",
            "name": "deletedProjectId"
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "5000a65923baaa3483f6792a96cb1b47",
    "id": null,
    "metadata": {},
    "name": "DeleteProjectDialogMutation",
    "operationKind": "mutation",
    "text": "mutation DeleteProjectDialogMutation(\n  $input: DeleteProjectInput!\n) {\n  deleteProject(input: $input) {\n    deletedProjectId\n  }\n}\n"
  }
};
})();

(node as any).hash = "83d47a8e39ddb5c7c1e65f51ccb6d5c8";

export default node;
