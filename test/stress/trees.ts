import { firstElement } from "@tabcat/ith-element";
import { compareBuckets } from "../../src/compare.js";
import { DEFAULT_AVERAGE } from "../../src/constants.js";
import { DefaultProllyTree } from "../../src/impls.js";
import { Bucket, Entry, ProllyTree } from "../../src/interface.js";
import {
  buildProllyTree,
  createProllyTreeEntries,
} from "../helpers/build-tree.js";
import { blockstore } from "../helpers/constants.js";

export const treeEntriesMax = 300;
export const treeEntriesHalf = Math.floor(treeEntriesMax / 2);
export const treeEntriesThird = Math.floor(treeEntriesMax / 3);

export const emptyTreeIds: number[] = [];
export const superTreeIds = Array(treeEntriesMax)
  .fill(0)
  .map((_, i) => i);
export const subTreeIds = Array(treeEntriesThird)
  .fill(0)
  .map((_, i) => i + treeEntriesThird);
export const lowerTreeIds = Array(Math.floor(treeEntriesHalf))
  .fill(0)
  .map((_, i) => i);
export const midTreeIds = Array(treeEntriesHalf)
  .fill(0)
  .map((_, i) => i + treeEntriesHalf / 2);
export const upperTreeIds = Array(Math.floor(treeEntriesHalf))
  .fill(0)
  .map((_, i) => i + treeEntriesHalf);

const namedTreeIds: Record<string, number[]> = {
  empty: emptyTreeIds,
  super: superTreeIds,
  sub: subTreeIds,
  lower: lowerTreeIds,
  mid: midTreeIds,
  upper: upperTreeIds,
};

for (const [name, ids] of Array.from(Object.entries(namedTreeIds))) {
  if (name === "empty") {
    continue;
  }

  namedTreeIds["randomized-" + name] = ids.filter(() => Math.random() - 0.5);
}

interface TreeState {
  tree: ProllyTree;
  state: Bucket[][];
  buckets: Bucket[];
  entries: Entry[];
  ids: number[];
}

export const trees: Map<string, TreeState> = new Map();

for (const [name, ids] of Array.from(Object.entries(namedTreeIds))) {
  if (name === "empty") {
    continue;
  }

  const entries = createProllyTreeEntries(ids);
  const state = buildProllyTree(blockstore, DEFAULT_AVERAGE, entries);
  const buckets = state.flat().sort(compareBuckets);
  const tree = new DefaultProllyTree(firstElement(firstElement(state)));

  trees.set(name, { tree, state, buckets, entries, ids });
}
