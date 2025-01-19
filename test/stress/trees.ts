import { firstElement } from "@tabcat/ith-element";
import { compareBuckets } from "../../src/compare.js";
import { DefaultProllyTree } from "../../src/impls.js";
import { Bucket, Entry, ProllyTree } from "../../src/interface.js";
import {
  buildProllyTree,
  createProllyTreeEntries,
} from "../helpers/build-tree.js";
import { blockstore } from "../helpers/constants.js";

// average is low so that there are more unique tree shapes with fewer entries
const average = 3;
// randomized trees remove 1 of 3 entries
const random_threshold = 1 / 3;

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
export const lowerTreeIds = Array(treeEntriesHalf)
  .fill(0)
  .map((_, i) => i);
export const midTreeIds = Array(treeEntriesHalf)
  .fill(0)
  .map((_, i) => i + Math.floor(treeEntriesHalf / 2));
export const upperTreeIds = Array(treeEntriesHalf)
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

  namedTreeIds["randomized-" + name] = ids.filter(
    () => Math.random() > random_threshold,
  );
}

// namedTreeIds["randomized-super"] = [
//   2, 4, 5, 6, 8, 9, 11, 15, 16, 17, 18, 20, 22, 23, 24, 26, 29, 30, 31, 32, 33,
//   34, 35, 38, 39, 40, 42, 44, 45, 46, 47, 49, 52, 53, 55, 57, 58, 59, 60, 63,
//   64, 65, 69, 70, 72, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 86, 87, 88, 89,
//   90, 91, 93, 94, 96, 98, 99, 102, 104, 105, 106, 107, 109, 110, 112, 113, 114,
//   116, 118, 122, 123, 124, 125, 127, 129, 130, 132, 133, 134, 135, 136, 137,
//   138, 139, 140, 141, 142, 143, 144, 145, 146, 148, 150, 152, 154, 156, 157,
//   158, 159, 162, 164, 165, 167, 168, 170, 172, 173, 174, 176, 177, 178, 179,
//   180, 183, 184, 185, 186, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197,
//   200, 201, 202, 203, 206, 207, 210, 211, 212, 215, 216, 219, 220, 221, 225,
//   226, 227, 228, 231, 234, 235, 238, 240, 241, 243, 244, 246, 247, 248, 250,
//   251, 252, 253, 257, 258, 259, 260, 263, 264, 265, 266, 267, 268, 270, 271,
//   272, 273, 274, 275, 279, 280, 282, 283, 284, 285, 286, 287, 288, 290, 292,
//   293, 295, 296, 298, 299,
// ];

// namedTreeIds["randomized-sub"] = [
//   100, 101, 103, 105, 106, 107, 112, 113, 114, 117, 119, 120, 121, 124, 125,
//   127, 129, 131, 132, 134, 136, 137, 138, 140, 142, 145, 146, 147, 151, 153,
//   154, 155, 156, 157, 158, 160, 162, 163, 164, 165, 166, 167, 169, 171, 172,
//   173, 174, 176, 177, 178, 180, 181, 182, 183, 184, 185, 186, 188, 189, 190,
//   193, 194, 195, 196, 199,
// ];

namedTreeIds["randomized-upper"] = [
  150, 151, 152, 153, 155, 156, 157, 160, 161, 162, 163, 164, 165, 166, 169,
  170, 171, 172, 174, 177, 178, 184, 185, 186, 187, 188, 189, 190, 191, 192,
  193, 194, 195, 196, 197, 198, 199, 200, 201, 203, 205, 206, 208, 210, 212,
  216, 217, 218, 219, 220, 221, 223, 224, 225, 226, 228, 229, 231, 233, 234,
  235, 237, 241, 242, 243, 244, 246, 247, 248, 249, 250, 251, 252, 256, 258,
  260, 262, 263, 265, 266, 267, 270, 272, 273, 274, 276, 277, 279, 281, 282,
  283, 284, 286, 290, 292, 293, 294, 297, 299,
];

interface TreeState {
  tree: ProllyTree;
  state: Bucket[][];
  buckets: Bucket[];
  entries: Entry[];
  ids: number[];
}

export const trees: Map<string, TreeState> = new Map();

for (const [name, ids] of Array.from(Object.entries(namedTreeIds))) {
  const entries = createProllyTreeEntries(ids);
  const state = buildProllyTree(blockstore, average, entries);
  const buckets = state.flat().sort(compareBuckets);
  const tree = new DefaultProllyTree(firstElement(firstElement(state)));

  trees.set(name, { tree, state, buckets, entries, ids });
}
