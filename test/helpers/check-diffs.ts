import { diff as orderedDiff } from "@tabcat/ordered-sets/difference";
import { expect } from "vitest";
import { compareBucketDigests, compareTuples } from "../../src/compare.js";
import { NodeDiff, diff } from "../../src/diff.js";
import { Bucket, Node, ProllyTree } from "../../src/interface.js";
import { blockstore, prefix, treeNodesMax } from "./constants.js";
import { createProllyTree, createProllyTreeNodes } from "./create-tree.js";

export const emptyTreeNodes: Node[] = [];
export const [emptyTree, emptyTreeState] = createProllyTree(
  blockstore,
  prefix,
  emptyTreeNodes,
);
const emptyTreeBuckets: Bucket[] = [emptyTree.root];

export const superTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i),
);
export const [superTree, superTreeState] = createProllyTree(
  blockstore,
  prefix,
  superTreeNodes,
);
const superTreeBuckets = superTreeState.flat().sort(compareBucketDigests);

export const subTreeNodes = createProllyTreeNodes(
  Array(Math.floor(treeNodesMax / 2))
    .fill(0)
    .map((_, i) => i),
);
export const [subTree, subTreeState] = createProllyTree(
  blockstore,
  prefix,
  subTreeNodes,
);
const subTreeBuckets = subTreeState.flat().sort(compareBucketDigests);

export const higherTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i + treeNodesMax),
);
export const [higherTree, higherTreeState] = createProllyTree(
  blockstore,
  prefix,
  higherTreeNodes,
);
const higherTreeBuckets = higherTreeState.flat().sort(compareBucketDigests);

export const randomTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i)
    .filter(() => Math.random() >= 0.5),
);
export const [randomTree, randomTreeState] = createProllyTree(
  blockstore,
  prefix,
  randomTreeNodes,
);
const randomTreeBuckets = randomTreeState.flat().sort(compareBucketDigests);

export const treesToStates: WeakMap<
  ProllyTree,
  { state: Bucket[][]; buckets: Bucket[]; nodes: Node[] }
> = new WeakMap();
treesToStates.set(emptyTree, {
  state: emptyTreeState,
  buckets: emptyTreeBuckets,
  nodes: emptyTreeNodes,
});
treesToStates.set(superTree, {
  state: superTreeState,
  buckets: superTreeBuckets,
  nodes: superTreeNodes,
});
treesToStates.set(subTree, {
  state: subTreeState,
  buckets: subTreeBuckets,
  nodes: subTreeNodes,
});
treesToStates.set(higherTree, {
  state: higherTreeState,
  buckets: higherTreeBuckets,
  nodes: higherTreeNodes,
});
treesToStates.set(randomTree, {
  state: randomTreeState,
  buckets: randomTreeBuckets,
  nodes: randomTreeNodes,
});

export async function checkDiffs(
  tree1: ProllyTree,
  tree2: ProllyTree,
): Promise<void> {
  const nodeDiffs: NodeDiff[] = [];
  const leftBuckets: Bucket[] = [];
  const rightBuckets: Bucket[] = [];

  for await (const d of diff(blockstore, tree1, tree2)) {
    for (const diff of d.nodes) {
      nodeDiffs.push(diff);
    }

    for (const [left, right] of d.buckets) {
      left && leftBuckets.push(left);
      right && rightBuckets.push(right);
    }
  }

  // would be nice to have this more granular
  leftBuckets.sort(compareBucketDigests);
  rightBuckets.sort(compareBucketDigests);
  const bucketDiffs = Array.from(
    orderedDiff(leftBuckets, rightBuckets, compareBucketDigests),
  );

  expect(nodeDiffs).to.deep.equal(
    Array.from(
      orderedDiff(
        treesToStates.get(tree1)!.nodes,
        treesToStates.get(tree2)!.nodes,
        compareTuples,
      ),
    ),
  );
  expect(bucketDiffs).to.deep.equal(
    Array.from(
      orderedDiff(
        treesToStates.get(tree1)!.buckets,
        treesToStates.get(tree2)!.buckets,
        compareBucketDigests,
      ),
    ),
  );
}
