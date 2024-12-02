import { diff as orderedDiff } from "@tabcat/sorted-sets/difference";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { describe, expect, it } from "vitest";
import { compareBuckets, compareBytes, compareTuples } from "../src/compare.js";
import { BucketDiff, EntryDiff } from "../src/diff.js";
import { cloneTree, createEmptyTree } from "../src/index.js";
import { Entry, ProllyTree } from "../src/interface.js";
import { Update, mutate } from "../src/mutate.js";
import { entryToTuple } from "../src/utils.js";
import { blockstore, trees, treesToStates } from "./helpers/constants.js";

const checkBuilder = async (
  tree1: ProllyTree,
  tree2: ProllyTree,
): Promise<void> => {
  const tree1States = treesToStates.get(tree1)!;
  const tree2States = treesToStates.get(tree2)!;

  const entries1 = tree1States.entries;
  const entries2 = tree2States.entries;

  let updates: Update[] = [];
  for (const [a, r] of pairwiseTraversal(entries2, entries1, compareTuples)) {
    if (a != null) {
      updates.push(a);
    } else {
      updates.push(entryToTuple(r));
    }
  }

  const clone1 = cloneTree(tree1);

  let actualEntryDiffs: EntryDiff[] = [];
  let actualBucketDiffs: BucketDiff[] = [];
  for await (const { entries, buckets } of mutate(
    blockstore,
    clone1,
    updates,
  )) {
    for (const diff of entries) {
      actualEntryDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  let expectedEntryDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree1)!.entries,
      treesToStates.get(tree2)!.entries,
      compareTuples,
      (a: Entry, b: Entry) => compareBytes(a.val, b.val) !== 0,
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

  // expect(actualEntryDiffs.length).to.equal(expectedEntryDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualEntryDiffs,
    expectedEntryDiffs,
    () => 0,
  )) {
    try {
      expect(actualDiff).to.deep.equal(expectedDiff);
    } catch (e) {
      console.log(actualDiff, expectedDiff);
      throw e;
    }
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
      console.log(actualDiff, expectedDiff);
      throw e;
    }
  }

  updates = [];
  for (const [a, r] of pairwiseTraversal(entries1, entries2, compareTuples)) {
    if (a != null) {
      updates.push(a);
    } else {
      updates.push(entryToTuple(r));
    }
  }

  actualEntryDiffs = [];
  actualBucketDiffs = [];
  for await (const { entries, buckets } of mutate(
    blockstore,
    clone1,
    updates,
  )) {
    for (const diff of entries) {
      actualEntryDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  expectedEntryDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree2)!.entries,
      treesToStates.get(tree1)!.entries,
      compareTuples,
      (a: Entry, b: Entry) => compareBytes(a.val, b.val) !== 0,
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

  // expect(actualEntryDiffs.length).to.equal(expectedEntryDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualEntryDiffs,
    expectedEntryDiffs,
    () => 0,
  )) {
    try {
      expect(actualDiff).to.deep.equal(expectedDiff);
    } catch (e) {
      console.log(actualDiff, expectedDiff);
      throw e;
    }
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
      console.log(actualDiff, expectedDiff);
      throw e;
    }
  }
};

describe("mutate trees", () => {
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
