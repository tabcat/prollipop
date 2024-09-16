import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement } from "@tabcat/ith-element";
import { MemoryBlockstore } from "blockstore-core/memory";
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
export const tuple = { timestamp, hash }
export const node = new DefaultNode(timestamp, hash, message);

export const average = 32;
export const level = 0;
export const prefix = { average, level };
export const nodes = [node];
export const encodedBucket = encode({
  average,
  level,
  nodes: [[timestamp, hash, message]],
});
export const bucketDigest = sha256(encodedBucket);
export const bucket = new DefaultBucket(
  average,
  level,
  nodes,
  encodedBucket,
  bucketDigest,
);
export const encodedEmptyBucket = encode({ average, level, nodes: [] });
export const emptyBucket = new DefaultBucket(
  average,
  level,
  [],
  encodedEmptyBucket,
  sha256(encodedEmptyBucket),
);

export const tree = new DefaultProllyTree(bucket)

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
  upperTreeIds,
  randomTreeIds,
];

const idsToNames: WeakMap<number[], string> = new WeakMap()
idsToNames.set(emptyTreeIds, 'empty')
idsToNames.set(superTreeIds, 'super')
idsToNames.set(subTreeIds, 'sub')
idsToNames.set(lowerTreeIds, 'lower')
idsToNames.set(upperTreeIds, 'upper')
idsToNames.set(randomTreeIds, 'random')

export const trees: ProllyTree[] = [];

export const treesToStates: WeakMap<
  ProllyTree,
  { state: Bucket[][]; buckets: Bucket[]; nodes: Node[]; ids: number[], name: string }
> = new WeakMap();

for (const ids of idsOfTrees) {
  const nodes = createProllyTreeNodes(ids);
  const state = buildProllyTreeState(blockstore, average, nodes);
  const tree = new DefaultProllyTree(firstElement(firstElement(state)));
  const buckets = state.flat().sort(compareBucketDigests);

  trees.push(tree);
  treesToStates.set(tree, { state, buckets, nodes, ids, name: idsToNames.get(ids)! });
}
