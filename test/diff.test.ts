import { diff as orderedDiff } from "@tabcat/sorted-sets/difference";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { describe, expect, it } from "vitest";
import { compareBuckets, compareBytes, compareTuples } from "../src/compare.js";
import { BucketDiff, EntryDiff, diff } from "../src/diff.js";
import { Entry, ProllyTree } from "../src/interface.js";
import {
  blockstore,
  emptyBucket,
  trees,
  treesToStates,
} from "./helpers/constants.js";

export async function checkDiffs(
  tree1: ProllyTree,
  tree2: ProllyTree,
): Promise<void> {
  const actualEntryDiffs: EntryDiff[] = [];
  const actualBucketDiffs: BucketDiff[] = [];

  for await (const { entries, buckets } of diff(blockstore, tree1, tree2)) {
    for (const diff of entries) {
      actualEntryDiffs.push(diff);
    }

    for (const diff of buckets) {
      actualBucketDiffs.push(diff);
    }
  }

  const expectedEntryDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree1)!.entries,
      treesToStates.get(tree2)!.entries,
      compareTuples,
      (a: Entry, b: Entry) => compareBytes(a.val, b.val) !== 0,
    ),
  );
  const expectedBucketDiffs = Array.from(
    orderedDiff(
      treesToStates.get(tree1)!.buckets,
      treesToStates.get(tree2)!.buckets,
      compareBuckets,
    ),
  );

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
}

describe("diff", () => {
  it("yields nothing for two empty trees", async () => {
    // both trees empty
    for await (const _ of diff(
      blockstore,
      { root: emptyBucket },
      { root: emptyBucket },
    )) {
      // this line is never reached
      expect.assertions(0);
    }
  });

  for (const tree1 of trees) {
    const tree1Name = treesToStates.get(tree1)!.name;
    for (const tree2 of trees) {
      const tree2Name = treesToStates.get(tree2)!.name;
      it(`yields diff of ${tree1Name} and ${tree2Name} trees`, async () =>
        checkDiffs(tree1, tree2));
    }
  }
});
