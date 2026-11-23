/**
 * @generated SignedSource<<42ff83eb859e6aaab38a4dade32eca55>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type Role = "MAINTAINER" | "MEMBER" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type SessionPage_viewer$data = {
  readonly avatarUrl: string | null | undefined;
  readonly canManageProjects: boolean;
  readonly name: string;
  readonly role: Role;
  readonly " $fragmentType": "SessionPage_viewer";
};
export type SessionPage_viewer$key = {
  readonly " $data"?: SessionPage_viewer$data;
  readonly " $fragmentSpreads": FragmentRefs<"SessionPage_viewer">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "SessionPage_viewer",
  "selections": [
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
      "name": "canManageProjects",
      "storageKey": null
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "a570ab746be28a7ab59b65e9d328c6b1";

export default node;
