/**
 * @generated SignedSource<<76f3e7389c03af2a2d81e9cbf56de796>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DeleteProjectDialog_project$data = {
  readonly id: string;
  readonly name: string;
  readonly " $fragmentType": "DeleteProjectDialog_project";
};
export type DeleteProjectDialog_project$key = {
  readonly " $data"?: DeleteProjectDialog_project$data;
  readonly " $fragmentSpreads": FragmentRefs<"DeleteProjectDialog_project">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "DeleteProjectDialog_project",
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
      "name": "name",
      "storageKey": null
    }
  ],
  "type": "Project",
  "abstractKey": null
};

(node as any).hash = "3c52b61276f5e7c8f82da525d8c0d6af";

export default node;
