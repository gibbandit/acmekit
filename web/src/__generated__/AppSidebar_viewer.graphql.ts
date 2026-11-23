/**
 * @generated SignedSource<<86a7f58541a53000523003ebedc76032>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type AppSidebar_viewer$data = {
  readonly " $fragmentSpreads": FragmentRefs<"accountMenu_viewer">;
  readonly " $fragmentType": "AppSidebar_viewer";
};
export type AppSidebar_viewer$key = {
  readonly " $data"?: AppSidebar_viewer$data;
  readonly " $fragmentSpreads": FragmentRefs<"AppSidebar_viewer">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "AppSidebar_viewer",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "accountMenu_viewer"
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "cdd1bfae1c189ae415a8724eaac0554b";

export default node;
