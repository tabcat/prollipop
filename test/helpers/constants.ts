import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
// import { firstElement } from "@tabcat/ith-element";
import { MemoryBlockstore } from "blockstore-core/memory";
// import { createIsBoundary } from "../../src/boundary.js";
// import { compareBuckets } from "../../src/compare.js";
import {
  DefaultBucket,
  DefaultEntry,
  DefaultProllyTree,
} from "../../src/impls.js";
// import { Bucket, Entry, ProllyTree } from "../../src/interface.js";
// import { buildProllyTreeState, createProllyTreeEntries } from "./build-tree.js";

declare global {
  var TREE_ENTRIES_MAX: string;
}

export const createEntry = (seq: number) => new DefaultEntry(seq, bytes, bytes);

export const bytes = new Uint8Array();

export const seq = 0;
export const key = bytes;
export const val = bytes;
export const tuple = { seq, key };
export const entry = createEntry(seq);

export const average = 32;
export const level = 0;
export const base = 0;
export const prefix = { average, level, base };
export const entries = [entry];
export const encodedBucket = {
  average,
  level,
  base,
  entries: [[seq, key, val]],
};
export const encodedBucketBytes = encode(encodedBucket);
export const bucketDigest = sha256(encodedBucketBytes);
export const bucket = new DefaultBucket(
  average,
  level,
  entries,
  encodedBucketBytes,
  bucketDigest,
);
export const encodedEmptyBucket = {
  average,
  level,
  base: 0,
  entries: [],
};
export const encodedEmptyBucketBytes = encode(encodedEmptyBucket);
export const emptyBucket = new DefaultBucket(
  average,
  level,
  [],
  encodedEmptyBucketBytes,
  sha256(encodedEmptyBucketBytes),
);

export const tree = new DefaultProllyTree(bucket);

export const blockstore = new MemoryBlockstore();

// export const treeEntriesMax = Number.parseInt(TREE_ENTRIES_MAX);
// export const treeEntriesHalf = Math.floor(treeEntriesMax / 2);
// export const treeEntriesThird = Math.floor(treeEntriesMax / 3);

// export const emptyTreeIds: number[] = [];
// export const superTreeIds = Array(treeEntriesMax)
//   .fill(0)
//   .map((_, i) => i);
// export const subTreeIds = Array(treeEntriesThird)
//   .fill(0)
//   .map((_, i) => i + treeEntriesThird);
// export const lowerTreeIds = Array(treeEntriesThird)
//   .fill(0)
//   .map((_, i) => i);
// export const upperTreeIds = Array(treeEntriesHalf)
//   .fill(0)
//   .map((_, i) => i + treeEntriesHalf);
// export const randomTreeIds = Array(treeEntriesMax)
//   .fill(0)
//   .map((_, i) => i)
//   .filter(() => Math.random() >= 0.5);

// const idsOfTrees = [
//   emptyTreeIds,
//   superTreeIds,
//   subTreeIds,
//   lowerTreeIds,
//   upperTreeIds,
//   randomTreeIds,
// ];

// const idsToNames: WeakMap<number[], string> = new WeakMap();
// idsToNames.set(emptyTreeIds, "empty");
// idsToNames.set(superTreeIds, "super");
// idsToNames.set(subTreeIds, "sub");
// idsToNames.set(lowerTreeIds, "lower");
// idsToNames.set(upperTreeIds, "upper");
// idsToNames.set(randomTreeIds, "random");

// export const trees: ProllyTree[] = [];

// export const treesToStates: WeakMap<
//   ProllyTree,
//   {
//     state: Bucket[][];
//     buckets: Bucket[];
//     entries: Entry[];
//     ids: number[];
//     name: string;
//   }
// > = new WeakMap();

// for (const ids of idsOfTrees) {
//   const entries = createProllyTreeEntries(ids);
//   const state = buildProllyTreeState(
//     blockstore,
//     average,
//     entries,
//     createIsBoundary,
//   );
//   const tree = new DefaultProllyTree(firstElement(firstElement(state)));
//   const buckets = state.flat().sort(compareBuckets);

//   trees.push(tree);
//   treesToStates.set(tree, {
//     state,
//     buckets,
//     entries,
//     ids,
//     name: idsToNames.get(ids)!,
//   });
// }
