import { diff as orderedDiff } from "@tabcat/sorted-sets/difference";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { describe, expect, it } from "vitest";
import {
  compareBuckets,
  compareBytes,
  compareTuples,
} from "../../src/compare.js";
import { BucketDiff, EntryDiff, diff } from "../../src/diff.js";
import { Entry } from "../../src/interface.js";
import { blockstore } from "../helpers/constants.js";
import { trees } from "./trees.js";

export async function checkDiffs(
  tree1Name: string,
  tree2Name: string,
): Promise<void> {
  const states1 = trees.get(tree1Name)!;
  const states2 = trees.get(tree2Name)!;

  const tree1 = states1.tree;
  const tree2 = states2.tree;

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
      states1.entries,
      states2.entries,
      compareTuples,
      (a: Entry, b: Entry) => compareBytes(a.val, b.val) !== 0,
    ),
  );
  const expectedBucketDiffs = Array.from(
    orderedDiff(states1.buckets, states2.buckets, compareBuckets),
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
  for (const tree1Name of trees.keys()) {
    for (const tree2Name of trees.keys()) {
      it(`yields diff of ${tree1Name} and ${tree2Name} trees`, async () =>
        await checkDiffs(tree1Name, tree2Name));
    }
  }
});
