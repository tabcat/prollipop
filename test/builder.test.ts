import { diff as orderedDiff } from "@tabcat/ordered-sets/difference";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { describe, expect, it } from "vitest";
import { Update, builder } from "../src/builder.js";
import { compareBuckets, compareBytes, compareTuples } from "../src/compare.js";
import { BucketDiff, NodeDiff } from "../src/diff.js";
import { cloneTree } from "../src/index.js";
import { Node, ProllyTree } from "../src/interface.js";
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
    // prioritizes adds over removes
    if (a != null) {
      updates.push({ op: "add", value: a });
    } else {
      updates.push({ op: "rm", value: r });
    }
  }

  const clone1 = cloneTree(tree1);

  let actualNodeDiffs: NodeDiff[] = [];
  let actualBucketDiffs: BucketDiff[] = [];
  for await (const { nodes, buckets } of builder(blockstore, clone1, updates)) {
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
      (a: Node, b: Node) => compareBytes(a.message, b.message) !== 0,
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
  // reverse all changes by using diff
  for (const [node1, node2] of actualNodeDiffs) {
    if (node1 != null) {
      updates.push({ op: "add", value: node1 });
    } else {
      updates.push({ op: "rm", value: node2 });
    }
  }

  actualNodeDiffs = [];
  actualBucketDiffs = [];
  for await (const { nodes, buckets } of builder(blockstore, clone1, updates)) {
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
      (a: Node, b: Node) => compareBytes(a.message, b.message) !== 0,
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

describe("builder", () => {
  for (const tree1 of trees) {
    const tree1Name = treesToStates.get(tree1)!.name;
    for (const tree2 of trees) {
      const tree2Name = treesToStates.get(tree2)!.name;

      it(`rebuilds a ${tree1Name} into a ${tree2Name} and back using output diff`, () =>
        checkBuilder(tree1, tree2));
    }
  }
});
