import { diff as orderedDiff } from "@tabcat/ordered-sets/difference";
import { expect } from "vitest";
import { compareBucketHashes, compareTuples } from "../../src/compare.js";
import { NodeDiff, diff } from "../../src/diff.js";
import { Bucket, Node, ProllyTree } from "../../src/interface.js";
import { Mc, Mh, blockstore, prefix, treeNodesMax } from "./constants.js";
import { createProllyTree, createProllyTreeNodes } from "./create-tree.js";
import { hasher } from "../../src/codec.js";

export const emptyTreeNodes: Node[] = [];
export const [emptyTree, emptyTreeState] = createProllyTree(
  blockstore,
  prefix,
  emptyTreeNodes,
  hasher,
);
const emptyTreeBuckets: Bucket<Mc, Mh>[] = [emptyTree.root];

export const superTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i),
  hasher,
);
export const [superTree, superTreeState] = createProllyTree(
  blockstore,
  prefix,
  superTreeNodes,
  hasher,
);
const superTreeBuckets = superTreeState.flat().sort(compareBucketHashes);

export const subTreeNodes = createProllyTreeNodes(
  Array(Math.floor(treeNodesMax / 2))
    .fill(0)
    .map((_, i) => i),
  hasher,
);
export const [subTree, subTreeState] = createProllyTree(
  blockstore,
  prefix,
  subTreeNodes,
  hasher,
);
const subTreeBuckets = subTreeState.flat().sort(compareBucketHashes);

export const higherTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i + treeNodesMax),
  hasher,
);
export const [higherTree, higherTreeState] = createProllyTree(
  blockstore,
  prefix,
  higherTreeNodes,
  hasher,
);
const higherTreeBuckets = higherTreeState.flat().sort(compareBucketHashes);

export const randomTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i)
    .filter(() => Math.random() >= 0.5),
  hasher,
);
export const [randomTree, randomTreeState] = createProllyTree(
  blockstore,
  prefix,
  randomTreeNodes,
  hasher,
);
const randomTreeBuckets = randomTreeState.flat().sort(compareBucketHashes);

export const treesToStates: WeakMap<
  ProllyTree<Mc, Mh>,
  { state: Bucket<Mc, Mh>[][]; buckets: Bucket<Mc, Mh>[]; nodes: Node[] }
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
  tree1: ProllyTree<Mc, Mh>,
  tree2: ProllyTree<Mc, Mh>,
): Promise<void> {
  const nodeDiffs: NodeDiff[] = [];
  const leftBuckets: Bucket<Mc, Mh>[] = [];
  const rightBuckets: Bucket<Mc, Mh>[] = [];

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
  leftBuckets.sort(compareBucketHashes);
  rightBuckets.sort(compareBucketHashes);
  const bucketDiffs = Array.from(
    orderedDiff(leftBuckets, rightBuckets, compareBucketHashes<Mc, Mh>),
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
        compareBucketHashes<Mc, Mh>,
      ),
    ),
  );
}
