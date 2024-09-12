import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { describe, expect, it } from "vitest";
import { Update, builder } from "../src/builder.js";
import { compareBuckets, compareBytes, compareTuples } from "../src/compare.js";
import { NodeDiff } from "../src/diff.js";
import { cloneTree } from "../src/index.js";
import { Bucket, ProllyTree } from "../src/interface.js";
import {
  blockstore,
  randomTreeIds,
  trees,
  treesToStates,
} from "./helpers/constants.js";

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
  let actualRemovals: Bucket[] = [];
  let actualAdditions: Bucket[] = [];
  for await (const { nodes, buckets } of builder(blockstore, clone1, updates)) {
    actualNodeDiffs.push(...nodes);
    buckets.forEach(([a, b]) =>
      a != null ? actualRemovals.push(a) : actualAdditions.push(b),
    );
  }

  const expectedNodeDiffs: NodeDiff[] = [];
  for (const [node1, node2] of pairwiseTraversal(
    nodes1,
    nodes2,
    compareTuples,
  )) {
    if (node1 == null) {
      expectedNodeDiffs.push([null, node2]);
    } else if (node2 == null) {
      expectedNodeDiffs.push([node1, null]);
    } else {
      if (compareBytes(node1.message, node2.message) !== 0) {
        expectedNodeDiffs.push([node1, node2]);
      }
    }
  }

  const buckets1 = tree1States.buckets;
  const buckets2 = tree2States.buckets;

  const expectedRemovals: Bucket[] = [];
  const expectedAdditions: Bucket[] = [];
  for (const [bucket1, bucket2] of pairwiseTraversal(
    buckets1,
    buckets2,
    compareBuckets,
  )) {
    if (bucket2 == null) {
      expectedRemovals.push(bucket1);
    }

    if (bucket1 == null) {
      expectedAdditions.push(bucket2);
    }
  }

  actualRemovals.sort(compareBuckets);
  actualAdditions.sort(compareBuckets);
  expectedRemovals.sort(compareBuckets);
  expectedAdditions.sort(compareBuckets);

  try {
    expect(clone1).to.deep.equal(tree2);
    expect(actualNodeDiffs).to.deep.equal(expectedNodeDiffs);
    expect(actualRemovals).to.deep.equal(expectedRemovals);
    expect(actualAdditions).to.deep.equal(expectedAdditions);
  } catch (e) {
    if (
      tree1States.ids === randomTreeIds ||
      tree2States.ids === randomTreeIds
    ) {
      console.log(randomTreeIds.toString());
      console.error("failed on randomTreeIds");
    }

    throw e;
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
  actualRemovals = [];
  actualAdditions = [];
  for await (const { nodes, buckets } of builder(blockstore, clone1, updates)) {
    actualNodeDiffs.push(...nodes);
    buckets.forEach(([a, b]) =>
      a != null ? actualRemovals.push(a) : actualAdditions.push(b),
    );
  }

  actualRemovals.sort(compareBuckets);
  actualAdditions.sort(compareBuckets);

  try {
    // reversed all changes
    expect(clone1).to.deep.equal(tree1);
    expect(actualNodeDiffs).to.deep.equal(
      expectedNodeDiffs.map((diff) => [diff[1], diff[0]]),
    );
    expect(actualRemovals).to.deep.equal(expectedAdditions);
    expect(actualAdditions).to.deep.equal(expectedRemovals);
  } catch (e) {
    if (
      tree1States.ids === randomTreeIds ||
      tree2States.ids === randomTreeIds
    ) {
      console.log(randomTreeIds.toString());
      console.error("failed on randomTreeIds (reversal)");
    }

    throw e;
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
