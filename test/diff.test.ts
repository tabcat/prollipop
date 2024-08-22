import { diff as orderedDiff } from "@tabcat/ordered-sets/difference";
import { describe, expect, it } from "vitest";
import { compareBucketHashes, compareTuples } from "../src/compare.js";
import { NodeDiff, diff } from "../src/diff.js";
import { cborTreeCodec, sha256SyncHasher } from "../src/index.js";
import { Bucket, Node, ProllyTree } from "../src/interface.js";
import {
  Mc,
  Mh,
  blockstore,
  prefix,
  treeNodesMax,
} from "./helpers/constants.js";
import {
  createProllyTree,
  createProllyTreeNodes,
} from "./helpers/create-tree.js";

const emptyTreeNodes: Node[] = [];
const [emptyTree, emptyTreeState] = createProllyTree(
  blockstore,
  prefix,
  emptyTreeNodes,
  cborTreeCodec,
  sha256SyncHasher,
);
const emptyTreeBuckets: Bucket<Mc, Mh>[] = [emptyTree.root];

const superTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i),
  sha256SyncHasher,
);
const [superTree, superTreeState] = createProllyTree(
  blockstore,
  prefix,
  superTreeNodes,
  cborTreeCodec,
  sha256SyncHasher,
);
const superTreeBuckets = superTreeState.flat().sort(compareBucketHashes);

const subTreeNodes = createProllyTreeNodes(
  Array(Math.floor(treeNodesMax / 2))
    .fill(0)
    .map((_, i) => i),
  sha256SyncHasher,
);
const [subTree, subTreeState] = createProllyTree(
  blockstore,
  prefix,
  subTreeNodes,
  cborTreeCodec,
  sha256SyncHasher,
);
const subTreeBuckets = subTreeState.flat().sort(compareBucketHashes);

const higherTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i + treeNodesMax),
  sha256SyncHasher,
);
const [higherTree, higherTreeState] = createProllyTree(
  blockstore,
  prefix,
  higherTreeNodes,
  cborTreeCodec,
  sha256SyncHasher,
);
const higherTreeBuckets = higherTreeState.flat().sort(compareBucketHashes);

const randomTreeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i)
    .filter(() => Math.random() >= 0.5),
  sha256SyncHasher,
);
const [randomTree, randomTreeState] = createProllyTree(
  blockstore,
  prefix,
  randomTreeNodes,
  cborTreeCodec,
  sha256SyncHasher,
);
const randomTreeBuckets = randomTreeState.flat().sort(compareBucketHashes);

const treesToStates: WeakMap<
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

async function checkDiffs(
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

describe("diff", () => {
  describe("diff", () => {
    it("yields the diff of two trees", async () => {
      // both trees empty
      for await (const _ of diff(blockstore, emptyTree, emptyTree)) {
        // this line is never reached
        expect.assertions(0);
      }
      await checkDiffs(emptyTree, emptyTree);

      // first tree empty
      await checkDiffs(emptyTree, superTree);

      // second tree empty
      await checkDiffs(superTree, emptyTree);

      // same tree
      await checkDiffs(superTree, superTree);

      // first tree superset of second
      await checkDiffs(subTree, superTree);

      // first tree subset of second
      await checkDiffs(superTree, subTree);

      // no overlap
      await checkDiffs(higherTree, subTree);
      await checkDiffs(subTree, higherTree);

      // randomTree
      await checkDiffs(randomTree, randomTree);
      await checkDiffs(randomTree, emptyTree);
      await checkDiffs(emptyTree, randomTree);
      await checkDiffs(randomTree, subTree);
      await checkDiffs(subTree, randomTree);
      await checkDiffs(randomTree, superTree);
      await checkDiffs(superTree, randomTree);
    });
  });
});
