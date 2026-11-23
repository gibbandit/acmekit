/**
 * @generated SignedSource<<0c12237939cdb68cbc7eec30dfdbd664>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type Role = "MAINTAINER" | "MEMBER" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type accountMenu_viewer$data = {
  readonly avatarUrl: string | null | undefined;
  readonly name: string;
  readonly role: Role;
  readonly " $fragmentType": "accountMenu_viewer";
};
export type accountMenu_viewer$key = {
  readonly " $data"?: accountMenu_viewer$data;
  readonly " $fragmentSpreads": FragmentRefs<"accountMenu_viewer">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "accountMenu_viewer",
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
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "41b803e432845d5466e076ecc6b3f11d";

export default node;
