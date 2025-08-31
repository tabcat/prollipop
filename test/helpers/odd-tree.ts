import { DefaultProllyTree } from "../../src/impls.js";
import { buildProllyTree, createProllyTreeEntries } from "./build-tree.js";
import { average, blockstore } from "./constants.js";

export const oddTreeIds = [0, 1, 2, 3, 4, 5];
export const oddTreeEntries = createProllyTreeEntries(oddTreeIds);

export const oddTreeState = buildProllyTree(
  blockstore,
  average,
  oddTreeEntries,
);

export const oddTree = new DefaultProllyTree(oddTreeState[0]![0]!);
