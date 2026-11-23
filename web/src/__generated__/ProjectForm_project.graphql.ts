/**
 * @generated SignedSource<<3964dad6995f019c9e1cbde3368fcd9e>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "PLANNED" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type ProjectForm_project$data = {
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: ProjectStatus;
  readonly " $fragmentType": "ProjectForm_project";
};
export type ProjectForm_project$key = {
  readonly " $data"?: ProjectForm_project$data;
  readonly " $fragmentSpreads": FragmentRefs<"ProjectForm_project">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "ProjectForm_project",
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
    }
  ],
  "type": "Project",
  "abstractKey": null
};

(node as any).hash = "2e0af6f219412a26c310e30f440da80a";

export default node;
