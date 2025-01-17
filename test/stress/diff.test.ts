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

  // would be nice to yield buckets in a sorted order wrt all yielded diffs
  actualBucketDiffs.sort((d1, d2) =>
    compareBuckets(d1[0] ?? d1[1], d2[0] ?? d2[1]),
  );

  expect(actualEntryDiffs.length).to.equal(expectedEntryDiffs.length);
  for (const [actualDiff, expectedDiff] of pairwiseTraversal(
    actualEntryDiffs,
    expectedEntryDiffs,
    () => 0,
  )) {
    try {
      expect(actualDiff).to.deep.equal(expectedDiff);
    } catch (e) {
      console.error("Failed entry diff on trees: ", tree1Name, tree2Name);
      throw e;
    }
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
      console.error("Failed bucket diff on trees: ", tree1Name, tree2Name);
      throw e;
    }
  }
}

describe("diff", () => {
  for (const tree1Name of trees.keys()) {
    for (const tree2Name of trees.keys()) {
      it(`yields diff of ${tree1Name} and ${tree2Name} trees`, async () => {
        try {
          await checkDiffs(tree1Name, tree2Name);
        } catch (e) {
          console.error("Failed diff on trees: ", tree1Name, tree2Name);
          if (tree1Name.includes("randomized")) {
            console.log(trees.get(tree1Name)?.ids.toString());
          }
          if (tree2Name.includes("randomized")) {
            console.log(trees.get(tree2Name)?.ids.toString());
          }
          throw e;
        }
      });
    }
  }
});
