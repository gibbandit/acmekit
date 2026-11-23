/**
 * @generated SignedSource<<8084e575fd1c52e5231a3e51330a1604>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "PLANNED" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type ProjectTable_project$data = ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: ProjectStatus;
  readonly updatedAt: string;
  readonly " $fragmentType": "ProjectTable_project";
}>;
export type ProjectTable_project$key = ReadonlyArray<{
  readonly " $data"?: ProjectTable_project$data;
  readonly " $fragmentSpreads": FragmentRefs<"ProjectTable_project">;
}>;

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": {
    "plural": true
  },
  "name": "ProjectTable_project",
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
  "type": "Project",
  "abstractKey": null
};

(node as any).hash = "cc697f205fb3c46e142e60e6ebe2bcd1";

export default node;
