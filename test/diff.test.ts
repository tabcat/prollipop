import { ExclusiveDiff } from "@tabcat/sorted-sets/difference";
import { describe, expect, it, vi } from "vitest";
import "../src/boundary.js";
import { ProllyTreeDiff, diff } from "../src/diff.js";
import { loadBucket } from "../src/utils.js";
import { blockstore, emptyBucket } from "./helpers/constants.js";
import { oddTree, oddTreeEntries } from "./helpers/odd-tree.js";

vi.mock("../src/boundary.js");

describe("diff", () => {
  it("yields nothing for two identical trees", async () => {
    for await (const _ of diff(blockstore, oddTree, oddTree)) {
      expect.fail();
    }
  });

  it("yields the different entries and buckets", async () => {
    const removed = <T>(e: T): ExclusiveDiff<T> => [e, null];

    const expected: ProllyTreeDiff[] = [
      {
        entries: oddTreeEntries.slice(0, 1).map(removed),
        buckets: [[null, emptyBucket]],
      },
      {
        entries: oddTreeEntries.slice(1).map(removed),
        buckets: [
          [
            await loadBucket(blockstore, oddTree.root.entries[0]!.val, false),
            null,
          ],
          [
            await loadBucket(blockstore, oddTree.root.entries[1]!.val, false),
            null,
          ],
          [
            await loadBucket(blockstore, oddTree.root.entries[2]!.val, true),
            null,
          ],
          [oddTree.root, null],
        ],
      },
    ];

    let count = 0;
    for await (const { entries, buckets } of diff(blockstore, oddTree, {
      root: emptyBucket,
    })) {
      try {
        expect(entries).to.deep.equal(expected[count]!.entries);
        expect(buckets).to.deep.equal(expected[count]!.buckets);
        count++;
      } catch (e) {
        console.error(e);
        throw new Error("failed diff test at count: " + count);
      }
    }
  });
});
