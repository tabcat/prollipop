import { diff as orderedDiff } from "@tabcat/sorted-sets/difference";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { describe, expect, it } from "vitest";
import {
  compareBuckets,
  compareBytes,
  compareTuples,
} from "../../src/compare.js";
import { BucketDiff, EntryDiff } from "../../src/diff.js";
import { cloneTree } from "../../src/index.js";
import { Entry } from "../../src/interface.js";
import { Update, mutate } from "../../src/mutate.js";
import { entryToTuple } from "../../src/utils.js";
import { blockstore } from "../helpers/constants.js";
import { trees } from "./trees.js";

const checkMutate = async (
  tree1Name: string,
  tree2Name: string,
): Promise<void> => {
  const tree1States = trees.get(tree1Name)!;
  const tree2States = trees.get(tree2Name)!;

  const tree1 = tree1States.tree;
  const tree2 = tree2States.tree;

  const entries1 = tree1States.entries;
  const entries2 = tree2States.entries;

  let updateBatch: Update[] = [];
  for (const [a, r] of pairwiseTraversal(entries2, entries1, compareTuples)) {
    if (a != null) {
      updateBatch.push(a);
    } else {
      updateBatch.push(entryToTuple(r));
    }
  }

  const clone1 = cloneTree(tree1);

  let actualEntryDiffs: EntryDiff[] = [];
  let actualBucketDiffs: BucketDiff[] = [];
  for await (const { entries, buckets } of mutate(blockstore, clone1, [
    updateBatch,
  ])) {
    for (const diff of entries) {
      actualEntryDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  let expectedEntryDiffs = Array.from(
    orderedDiff(
      tree1States.entries,
      tree2States.entries,
      compareTuples,
      (a: Entry, b: Entry) => compareBytes(a.val, b.val) !== 0,
    ),
  );
  let expectedBucketDiffs = Array.from(
    orderedDiff(tree1States.buckets, tree2States.buckets, compareBuckets),
  );

  actualBucketDiffs.sort((a, b) => compareBuckets(a[0] ?? a[1], b[0] ?? b[1]));

  expect(clone1).to.deep.equal(tree2);

  expect(actualEntryDiffs.length).to.equal(expectedEntryDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualEntryDiffs,
    expectedEntryDiffs,
    () => 0,
  )) {
    expect(actualDiff).to.deep.equal(expectedDiff);
  }

  // expect(actualBucketDiffs.length).to.equal(expectedBucketDiffs.length);
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

  updateBatch = [];
  for (const [a, r] of pairwiseTraversal(entries1, entries2, compareTuples)) {
    if (a != null) {
      updateBatch.push(a);
    } else {
      updateBatch.push(entryToTuple(r));
    }
  }

  actualEntryDiffs = [];
  actualBucketDiffs = [];
  for await (const { entries, buckets } of mutate(blockstore, clone1, [
    updateBatch,
  ])) {
    for (const diff of entries) {
      actualEntryDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  expectedEntryDiffs = Array.from(
    orderedDiff(
      tree2States.entries,
      tree1States.entries,
      compareTuples,
      (a: Entry, b: Entry) => compareBytes(a.val, b.val) !== 0,
    ),
  );
  expectedBucketDiffs = Array.from(
    orderedDiff(tree2States.buckets, tree1States.buckets, compareBuckets),
  );

  expect(clone1).to.deep.equal(tree1);

  expect(actualEntryDiffs.length).to.equal(expectedEntryDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualEntryDiffs,
    expectedEntryDiffs,
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
};

describe("mutate trees", () => {
  it("tests upper and randomized-upper", async () => {
    await checkMutate("upper", "randomized-upper");
  });

  for (const tree1Name of trees.keys()) {
    for (const tree2Name of trees.keys()) {
      it(`rebuilds a ${tree1Name} into a ${tree2Name} and back using output diff`, async () => {
        try {
          await checkMutate(tree1Name, tree2Name);
        } catch (e) {
          console.error("Failed mutate on trees: ", tree1Name, tree2Name);
          if (tree1Name.includes("randomized")) {
            console.log(trees.get(tree1Name)!.ids.toString());
          }
          if (tree2Name.includes("randomized")) {
            console.log(trees.get(tree2Name)!.ids.toString());
          }
          throw e;
        }
      });
    }
  }
});
