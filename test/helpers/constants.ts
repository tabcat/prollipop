import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement } from "@tabcat/ith-element";
import { MemoryBlockstore } from "blockstore-core/memory";
import { compareBuckets } from "../../src/compare.js";
import {
  DefaultBucket,
  DefaultEntry,
  DefaultProllyTree,
} from "../../src/impls.js";
import { Bucket, Entry, ProllyTree } from "../../src/interface.js";
import { buildProllyTreeState, createProllyTreeEntries } from "./build-tree.js";

declare global {
  var TREE_ENTRIES_MAX: string;
}

export const seq = 0;
export const key = new Uint8Array(4); // isBoundaryHash expects Uint8Array with length >= 4
export const val = new Uint8Array(0);
export const tuple = { seq, key };
export const entry = new DefaultEntry(seq, key, val);

export const average = 32;
export const level = 0;
export const base = 0;
export const prefix = { average, level, base };
export const entries = [entry];
export const encodedBucket = encode({
  average,
  level,
  base,
  entries: [[seq, key, val]],
});
export const bucketDigest = sha256(encodedBucket);
export const bucket = new DefaultBucket(
  average,
  level,
  entries,
  encodedBucket,
  bucketDigest,
);
export const encodedEmptyBucket = encode({
  average,
  level,
  base: 0,
  entries: [],
});
export const emptyBucket = new DefaultBucket(
  average,
  level,
  [],
  encodedEmptyBucket,
  sha256(encodedEmptyBucket),
);

export const tree = new DefaultProllyTree(bucket);

export const blockstore = new MemoryBlockstore();

export const treeEntriesMax = Number.parseInt(TREE_ENTRIES_MAX);

export const emptyTreeIds: number[] = [];
export const superTreeIds = Array(treeEntriesMax)
  .fill(0)
  .map((_, i) => i);
export const subTreeIds = Array(treeEntriesMax / 3)
  .fill(0)
  .map((_, i) => i + treeEntriesMax / 3);
export const lowerTreeIds = Array(Math.floor(treeEntriesMax / 2))
  .fill(0)
  .map((_, i) => i);
export const upperTreeIds = Array(Math.floor(treeEntriesMax / 2))
  .fill(0)
  .map((_, i) => i + treeEntriesMax / 2);
export const randomTreeIds = Array(treeEntriesMax)
  .fill(0)
  .map((_, i) => i)
  .filter(() => Math.random() >= 0.5);

const idsOfTrees = [
  emptyTreeIds,
  superTreeIds,
  subTreeIds,
  lowerTreeIds,
  upperTreeIds,
  randomTreeIds,
];

const idsToNames: WeakMap<number[], string> = new WeakMap();
idsToNames.set(emptyTreeIds, "empty");
idsToNames.set(superTreeIds, "super");
idsToNames.set(subTreeIds, "sub");
idsToNames.set(lowerTreeIds, "lower");
idsToNames.set(upperTreeIds, "upper");
idsToNames.set(randomTreeIds, "random");

export const trees: ProllyTree[] = [];

export const treesToStates: WeakMap<
  ProllyTree,
  {
    state: Bucket[][];
    buckets: Bucket[];
    entries: Entry[];
    ids: number[];
    name: string;
  }
> = new WeakMap();

for (const ids of idsOfTrees) {
  const entries = createProllyTreeEntries(ids);
  const state = buildProllyTreeState(blockstore, average, entries);
  const tree = new DefaultProllyTree(firstElement(firstElement(state)));
  const buckets = state.flat().sort(compareBuckets);

  trees.push(tree);
  treesToStates.set(tree, {
    state,
    buckets,
    entries,
    ids,
    name: idsToNames.get(ids)!,
  });
}
