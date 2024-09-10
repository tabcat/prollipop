import { sha256 } from "@noble/hashes/sha256";
import { firstElement } from "@tabcat/ith-element";
import { MemoryBlockstore } from "blockstore-core/memory";
import { encodeBucket } from "../../src/codec.js";
import { compareBucketDigests } from "../../src/compare.js";
import {
  DefaultBucket,
  DefaultNode,
  DefaultProllyTree,
} from "../../src/impls.js";
import { Bucket, Node, ProllyTree } from "../../src/interface.js";
import { buildProllyTreeState, createProllyTreeNodes } from "./build-tree.js";

export const timestamp = 0;
export const hash = new Uint8Array(4); // isBoundaryHash expects Uint8Array with length >= 4
export const message = new Uint8Array(0);
export const node = new DefaultNode(timestamp, hash, message);

export const average = 32;
export const level = 0;
export const prefix = { average, level };
export const nodes = [node];
export const encodedBucket = encodeBucket(average, level, nodes);
export const bucketDigest = sha256(encodedBucket);
export const bucket = new DefaultBucket(
  average,
  level,
  nodes,
  encodeBucket(average, level, nodes),
  bucketDigest,
);
export const encodedEmptyBucket = encodeBucket(average, level, []);
export const emptyBucket = new DefaultBucket(
  average,
  level,
  [],
  encodedEmptyBucket,
  sha256(encodedEmptyBucket),
);

export const blockstore = new MemoryBlockstore();

export const treeNodesMax = 3000;

export const emptyTreeIds: number[] = [];
export const superTreeIds = Array(treeNodesMax)
  .fill(0)
  .map((_, i) => i);
export const subTreeIds = Array(treeNodesMax / 3)
  .fill(0)
  .map((_, i) => i + treeNodesMax / 3);
export const lowerTreeIds = Array(Math.floor(treeNodesMax / 2))
  .fill(0)
  .map((_, i) => i);
export const upperTreeIds = Array(Math.floor(treeNodesMax / 2))
  .fill(0)
  .map((_, i) => i + treeNodesMax / 2);
export const randomTreeIds = Array(treeNodesMax)
  .fill(0)
  .map((_, i) => i)
  .filter(() => Math.random() >= 0.5);

const idsOfTrees = [
  emptyTreeIds,
  superTreeIds,
  subTreeIds,
  lowerTreeIds,
  randomTreeIds,
];

export const trees: ProllyTree[] = [];

export const treesToStates: WeakMap<
  ProllyTree,
  { state: Bucket[][]; buckets: Bucket[]; nodes: Node[]; ids: number[] }
> = new WeakMap();

for (const ids of idsOfTrees) {
  const nodes = createProllyTreeNodes(ids);
  const state = buildProllyTreeState(blockstore, average, nodes);
  const tree = new DefaultProllyTree(firstElement(firstElement(state)));
  const buckets = state.flat().sort(compareBucketDigests);

  trees.push(tree);
  treesToStates.set(tree, { state, buckets, nodes, ids });
}
