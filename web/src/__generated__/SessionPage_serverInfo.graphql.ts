/**
 * @generated SignedSource<<da5b996ea25c41609b692cbb4db2c234>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type SessionPage_serverInfo$data = {
  readonly demoEnabled: boolean;
  readonly githubEnabled: boolean;
  readonly name: string;
  readonly storage: string;
  readonly version: string;
  readonly " $fragmentType": "SessionPage_serverInfo";
};
export type SessionPage_serverInfo$key = {
  readonly " $data"?: SessionPage_serverInfo$data;
  readonly " $fragmentSpreads": FragmentRefs<"SessionPage_serverInfo">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "SessionPage_serverInfo",
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
  "type": "ServerInfo",
  "abstractKey": null
};

(node as any).hash = "2ea96957cebed99f5b293b775dcbe63d";

export default node;
