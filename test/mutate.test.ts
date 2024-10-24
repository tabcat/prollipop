import { diff as orderedDiff } from "@tabcat/ordered-sets/difference";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { describe, expect, it } from "vitest";
import { compareBuckets, compareBytes, compareTuples } from "../src/compare.js";
import { BucketDiff, NodeDiff } from "../src/diff.js";
import { cloneTree, createEmptyTree } from "../src/index.js";
import { Node, ProllyTree } from "../src/interface.js";
import { Update, mutate } from "../src/mutate.js";
import { nodeToTuple } from "../src/utils.js";
import { blockstore, trees, treesToStates } from "./helpers/constants.js";

const checkBuilder = async (
  tree1: ProllyTree,
  tree2: ProllyTree,
): Promise<void> => {
  const tree1States = treesToStates.get(tree1)!;
  const tree2States = treesToStates.get(tree2)!;

  const nodes1 = tree1States.nodes;
  const nodes2 = tree2States.nodes;

  let updates: Update[] = [];
  for (const [a, r] of pairwiseTraversal(nodes2, nodes1, compareTuples)) {
    if (a != null) {
      updates.push(a);
    } else {
      updates.push(nodeToTuple(r));
    }
  }

  const clone1 = cloneTree(tree1);

  let actualNodeDiffs: NodeDiff[] = [];
  let actualBucketDiffs: BucketDiff[] = [];
  for await (const { nodes, buckets } of mutate(blockstore, clone1, updates)) {
    for (const diff of nodes) {
      actualNodeDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  let expectedNodeDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree1)!.nodes,
      treesToStates.get(tree2)!.nodes,
      compareTuples,
      (a: Node, b: Node) => compareBytes(a.val, b.val) !== 0,
    ),
  );
  let expectedBucketDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree1)!.buckets,
      treesToStates.get(tree2)!.buckets,
      compareBuckets,
    ),
  );

  expect(clone1).to.deep.equal(tree2);

  expect(actualNodeDiffs.length).to.equal(expectedNodeDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualNodeDiffs,
    expectedNodeDiffs,
    () => 0,
  )) {
    expect(actualDiff).to.deep.equal(expectedDiff);
  }

  expect(actualBucketDiffs.length).to.equal(expectedBucketDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualBucketDiffs,
    expectedBucketDiffs,
    () => 0,
  )) {
    expect(actualDiff).to.deep.equal(expectedDiff);
  }

  updates = [];
  for (const [a, r] of pairwiseTraversal(nodes1, nodes2, compareTuples)) {
    if (a != null) {
      updates.push(a);
    } else {
      updates.push(nodeToTuple(r));
    }
  }

  actualNodeDiffs = [];
  actualBucketDiffs = [];
  for await (const { nodes, buckets } of mutate(blockstore, clone1, updates)) {
    for (const diff of nodes) {
      actualNodeDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  expectedNodeDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree2)!.nodes,
      treesToStates.get(tree1)!.nodes,
      compareTuples,
      (a: Node, b: Node) => compareBytes(a.val, b.val) !== 0,
    ),
  );
  expectedBucketDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree2)!.buckets,
      treesToStates.get(tree1)!.buckets,
      compareBuckets,
    ),
  );

  expect(clone1).to.deep.equal(tree1);

  expect(actualNodeDiffs.length).to.equal(expectedNodeDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualNodeDiffs,
    expectedNodeDiffs,
    () => 0,
  )) {
    expect(actualDiff).to.deep.equal(expectedDiff);
  }

  expect(actualBucketDiffs.length).to.equal(expectedBucketDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualBucketDiffs,
    expectedBucketDiffs,
    () => 0,
  )) {
    try {
      expect(actualDiff).to.deep.equal(expectedDiff);
    } catch (e) {
      throw e;
    }
  }
};

describe("mutate", () => {
  for (const tree1 of trees) {
    const tree1Name = treesToStates.get(tree1)!.name;
    for (const tree2 of trees) {
      const tree2Name = treesToStates.get(tree2)!.name;

      it(`rebuilds a ${tree1Name} into a ${tree2Name} and back using output diff`, async () => {
        try {
          await checkBuilder(tree1, tree2);
        } catch (e) {
          if (tree1Name === "random") {
            console.log(treesToStates.get(tree1)!.ids.toString());
          }
          if (tree2Name === "random") {
            console.log(treesToStates.get(tree2)!.ids.toString());
          }

          throw e;
        }
      });
    }
  }

  it("accepts updates with type AwaitIterable<Update | Update[]>", async () => {
    const tree1 = createEmptyTree();
    const tree2 = createEmptyTree();

    const updates: Update[] = [
      { seq: 1, key: new Uint8Array(32), val: new Uint8Array() },
    ];

    for await (const _ of mutate(blockstore, tree1, updates)) {
    }

    for await (const _ of mutate(blockstore, tree2, [updates])) {
    }

    expect(tree1).to.deep.equal(tree2);
  });
});
