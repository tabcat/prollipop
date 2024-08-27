import { describe, expect, it } from "vitest";
import { diff } from "../src/diff.js";
import {
  checkDiffs,
  emptyTree,
  higherTree,
  randomTree,
  subTree,
  superTree,
} from "./helpers/check-diffs.js";
import { blockstore } from "./helpers/constants.js";

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
