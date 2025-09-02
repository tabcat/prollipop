import { describe, expect, it, vi } from "vitest";
import { IsBoundary } from "../src/boundary.js";
import { createSharedAwaitIterable } from "../src/common.js";
import { createCursor } from "../src/cursor/index.js";
import { EntryDiff, ProllyTreeDiff } from "../src/diff.js";
import { cloneTree } from "../src/index.js";
import { Entry } from "../src/interface.js";
import {
  State,
  Updts,
  applyUpdate,
  collectUpdates,
  createGetUpdatee,
  getUserUpdateKey,
  mutate,
  rebuildLevel,
  segmentEntries,
} from "../src/mutate.js";
import { loadBucket, toKey } from "../src/utils.js";
import {
  average,
  blockstore,
  emptyBucket,
  emptyTree,
  key,
} from "./helpers/constants.js";
import { oddTree, oddTreeEntries, oddTreeState } from "./helpers/odd-tree.js";
import { bytesToNumber, createEntry, numberToBytes } from "./helpers/utils.js";

vi.mock("../src/boundary.js");

describe("mutate", () => {
  describe("applyUpdate", () => {
    const entry = createEntry(0);

    it("returns [null, null] if there was no entry or update", () => {
      expect(applyUpdate(null, null)).to.deep.equal([null, null]);
    });

    it("returns [entry, null] if the entry exists but update does not", () => {
      expect(applyUpdate(entry, null)).to.deep.equal([entry, null]);
    });

    describe("add", () => {
      const update = createEntry(0);

      it("returns [updateEntry, [null, updateEntry]] if entry does not exist", () => {
        expect(applyUpdate(null, update)).to.deep.equal([
          update,
          [null, update],
        ]);
      });

      it("returns [entry, null] if entry exists", () => {
        expect(applyUpdate(entry, entry)).to.deep.equal([entry, null]);
      });

      it("returns [updateEntry, [entry, updateEntry]] if val differs", () => {
        const update = { ...entry, val: new Uint8Array(1) };
        expect(applyUpdate(entry, update)).to.deep.equal([
          update,
          [entry, update],
        ]);
      });
    });

    describe("strict removal", () => {
      const update = { ...entry, strict: true };

      it("returns [null, null] if entry does not exist", () => {
        expect(applyUpdate(null, update)).to.deep.equal([null, null]);
      });

      it("returns [null, [entry, null]] if entry exists", () => {
        expect(applyUpdate(entry, update)).to.deep.equal([null, [entry, null]]);
      });

      it("returns [entry, null] if val differs", () => {
        const update = { ...entry, val: new Uint8Array(1), strict: true };
        expect(applyUpdate(entry, update)).to.deep.equal([entry, null]);
      });
    });

    describe("removal", () => {
      const update = key;

      it("returns [null, null] if entry does not exist", () => {
        expect(applyUpdate(null, update)).to.deep.equal([null, null]);
      });

      it("returns [null, [entry, null]] if entry exists", () => {
        expect(applyUpdate(entry, update)).to.deep.equal([null, [entry, null]]);
      });
    });
  });

  describe("getUserUpdateKey", () => {
    it("returns a key from updts.user", async () => {
      const updates = createSharedAwaitIterable([[key]]);

      const level = 0;
      const updts: Updts = {
        current: [],
        user: updates,
        next: [],
      };

      const currentKey = await getUserUpdateKey(updts, level);

      expect(currentKey).to.deep.equal(key);
      expect(updts.current.length).to.equal(1);
    });

    it("returns null if updts.user is empty", async () => {
      const level = 0;
      const updts: Updts = {
        current: [],
        user: [],
        next: [],
      };
      const currentKey = await getUserUpdateKey(updts, level);

      expect(currentKey).to.equal(null);
    });

    it("returns null if level > 0", async () => {
      const updates = createSharedAwaitIterable([[key]]);

      const level = 1;
      const updts: Updts = {
        current: [],
        user: updates,
        next: [],
      };

      const currentKey = await getUserUpdateKey(updts, level);

      expect(currentKey).to.equal(null);
      expect(updts.current.length).to.equal(0);
    });
  });

  describe("getUpdatee", () => {
    // const average = 2;

    // const [entry1, id1] = createBoundaryEntry(average, 0, 0);
    // const [entry2, id2] = createBoundaryEntry(average, 0, id1 + 1);
    // const [entry3] = createBoundaryEntry(average, 0, id2 + 1);

    // const bucket1 = createBucket(average, 0, [entry1], {
    //   isHead: true,
    //   isTail: false,
    // });
    // const bucket2 = createBucket(average, 0, [entry2], {
    //   isHead: false,
    //   isTail: false,
    // });
    // const bucket3 = createBucket(average, 0, [entry3], {
    //   isHead: false,
    //   isTail: true,
    // });
    // const rootBucket = createBucket(
    //   average,
    //   0,
    //   [
    //     getBucketEntry(bucket1)!,
    //     getBucketEntry(bucket2)!,
    //     getBucketEntry(bucket3)!,
    //   ],
    //   {
    //     isHead: true,
    //     isTail: false,
    //   },
    // );

    it("returns next bucket if leftovers is not empty", async () => {
      const cursor = createCursor(blockstore, oddTree);
      cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![0]!];
      const getUpdatee = createGetUpdatee(average, 0, cursor);
      const updatee = await getUpdatee(key, true);

      expect(updatee).to.deep.equal(oddTreeState[1]![1]!);
    });

    it("returns next key if level has not changed", async () => {
      const cursor = createCursor(blockstore, oddTree);
      cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![0]!];
      const getUpdatee = createGetUpdatee(average, 0, cursor);
      const updatee = await getUpdatee(numberToBytes(4), false);

      expect(updatee).to.deep.equal(oddTreeState[1]![2]!);
    });

    it("returns jump to key if level has changed", async () => {
      const cursor = createCursor(blockstore, oddTree);
      cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![0]!];
      const getUpdatee = createGetUpdatee(average, 1, cursor);
      const updatee = await getUpdatee(key, false);

      expect(updatee).to.deep.equal(oddTreeState[0]![0]!);
    });

    it("returns empty bucket on level if leftovers is empty and level > root level", async () => {
      const cursor = createCursor(blockstore, oddTree);
      const getUpdatee = createGetUpdatee(average, 2, cursor);

      const updatee = await getUpdatee(key, false);

      expect(updatee).to.not.equal(null);

      const context = updatee!.getContext();

      expect(context.isTail).to.be.true;
      expect(context.isHead).to.be.true;
    });
  });

  describe("collectUpdates", () => {
    const entries = [0, 1, 2, 3].map((n) => createEntry(n));

    it("does not collect updates if last of updts.current = boundary", async () => {
      const boundary = entries[0]!;
      const updts: Updts = {
        current: entries.slice(0, 1),
        user: [entries.slice(1)],
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(entries.slice(0, 1));
    });

    it("does not collect updates if last of updts.current > boundary", async () => {
      const boundary = entries[0]!;
      const updts: Updts = {
        current: entries.slice(0, 2),
        user: [entries.slice(2)],
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(entries.slice(0, 2));
    });

    it("collects updates until last of updts.current = boundary", async () => {
      const boundary = entries[1]!;
      const updts: Updts = {
        current: entries.slice(0, 1),
        user: entries.slice(1).map((e) => [e]),
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(entries.slice(0, 2));
    });

    it("collects updates until last of updts.current > boundary", async () => {
      const boundary = entries[1]!;
      const updts: Updts = {
        current: entries.slice(0, 1),
        user: entries.slice(2).map((e) => [e]),
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(
        entries.filter(
          (e) => bytesToNumber(e.key) !== 1 && bytesToNumber(e.key) !== 3,
        ),
      );
    });

    it("collects all updates if isHead", async () => {
      const boundary = entries[0]!;
      const updts: Updts = {
        current: [entries[0]!],
        user: entries.slice(1).map((e) => [e]),
        next: [],
      };

      await collectUpdates(boundary, updts, true);

      expect(updts.current).to.deep.equal(entries);
    });
  });

  describe("segmentEntries", () => {
    const isBoundary: IsBoundary = (e) => bytesToNumber(e.key) % 2 === 1;

    describe("basic operations", () => {
      it("returns original segment and empty diff when no changes needed", () => {
        const currentEntries = [createEntry(0), createEntry(1)];
        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          [],
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([currentEntries]); // Same reference
        expect(diffSegments).to.deep.equal([[]]);
        expect(leftovers).to.deep.equal(false);
      });

      it("processes lastEntries and lasDiffs correctly", () => {
        const lastEntries = [createEntry(0)];
        const lastDiffs: EntryDiff[] = [[null, createEntry(0)]];

        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          [createEntry(1)],
          lastEntries,
          lastDiffs,
          [],
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([[createEntry(0), createEntry(1)]]);
        expect(diffSegments).to.deep.equal([lastDiffs]);
        expect(leftovers).to.deep.equal(false);
      });
    });

    describe("updates", () => {
      it("handles add updates", () => {
        const currentEntries = [createEntry(1)];
        const updates = [createEntry(0)];

        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          updates,
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([[createEntry(0), createEntry(1)]]);
        expect(diffSegments).to.deep.equal([[[null, createEntry(0)]]]);
        expect(leftovers).to.equal(false);
      });

      it("handles remove updates", () => {
        const currentEntries = [createEntry(0), createEntry(1)];
        const updates = [toKey(currentEntries[0]!)];

        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          updates,
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([[createEntry(1)]]);
        expect(diffSegments).to.deep.equal([[[currentEntries[0], null]]]);
        expect(leftovers).to.equal(false);
      });

      it("handles strict remove updates", () => {
        const currentEntries = [createEntry(0), createEntry(1)];
        const updates = [{ ...currentEntries[0]!, strict: true }];

        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          updates,
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([[createEntry(1)]]);
        expect(diffSegments).to.deep.equal([[[currentEntries[0], null]]]);
        expect(leftovers).to.equal(false);
      });
    });

    // Boundary handling tests
    describe("boundary handling", () => {
      it("splits bucket at boundaries", () => {
        const currentEntries = [createEntry(0), createEntry(2), createEntry(3)];
        const updates = [createEntry(1)];

        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          updates,
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([
          [createEntry(0), createEntry(1)],
          [createEntry(2), createEntry(3)],
        ]);
        expect(diffSegments).to.deep.equal([[[null, createEntry(1)]], []]);
        expect(leftovers).to.equal(false);
      });
    });

    describe("edge cases", () => {
      it("handles empty bucket", () => {
        const currentEntries: Entry[] = [];
        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          [],
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([[]]);
        expect(diffSegments).to.deep.equal([[]]);
        expect(leftovers).to.equal(true);
      });

      it("handles complete removal of entries", () => {
        const currentEntries = [createEntry(0), createEntry(1)];
        const updates = currentEntries.map(toKey);

        const [entrySegments, diffSegments, leftovers] = segmentEntries(
          currentEntries,
          [],
          [],
          updates,
          isBoundary,
        );

        expect(entrySegments).to.deep.equal([[]]);
        expect(diffSegments).to.deep.equal([
          [
            [currentEntries[0], null],
            [currentEntries[1], null],
          ],
        ]);
        expect(leftovers).to.equal(true);
      });
    });
  });

  describe("rebuildLevel", () => {
    it("sets state.newRoot to current root and returns if no updates", async () => {
      const cursor = createCursor(blockstore, oddTree);
      const updts: Updts = {
        current: [],
        user: [],
        next: [],
      };
      const state: State = {
        newRoot: null,
        removedBuckets: [],
      };
      const level = 0;

      for await (const _ of rebuildLevel(
        cursor,
        updts,
        state,
        average,
        level,
      )) {
        expect.fail();
      }

      expect(state.newRoot).to.equal(oddTree.root);
    });

    it("rebuilds a single bucket level into a multi-bucket level", async () => {
      const cursor = createCursor(blockstore, emptyTree);
      const updts: Updts = {
        current: oddTreeEntries.slice(),
        user: [],
        next: [],
      };
      const state: State = {
        newRoot: null,
        removedBuckets: [],
      };
      const level = 0;

      const expected: ProllyTreeDiff[] = [
        {
          entries: oddTreeEntries.map((e) => [null, e]),
          buckets: [
            [emptyBucket, null],
            [
              null,
              await loadBucket(
                blockstore,
                oddTree.root.entries[0]!.val,
                {
                  isTail: true,
                  isHead: false,
                },
                {
                  range: ["MIN_KEY", oddTree.root.entries[0]!.key],
                },
              ),
            ],
            [
              null,
              await loadBucket(
                blockstore,
                oddTree.root.entries[1]!.val,
                {
                  isTail: false,
                  isHead: false,
                },
                {
                  range: [
                    oddTree.root.entries[0]!.key,
                    oddTree.root.entries[1]!.key,
                  ],
                },
              ),
            ],
            [
              null,
              await loadBucket(
                blockstore,
                oddTree.root.entries[2]!.val,
                {
                  isTail: true,
                  isHead: true,
                },
                {
                  range: [
                    oddTree.root.entries[1]!.key,
                    oddTree.root.entries[2]!.key,
                  ],
                },
              ),
            ],
          ],
        },
      ];

      let count = 0;
      for await (const { entries, buckets } of rebuildLevel(
        cursor,
        updts,
        state,
        average,
        level,
      )) {
        expect(entries).to.deep.equal(expected[count]?.entries);
        expect(buckets).to.deep.equal(expected[count]?.buckets);
        count++;
      }

      expect(state.newRoot).to.equal(null);
      expect(state.removedBuckets).to.deep.equal([]);
      expect(updts.next).to.deep.equal(oddTree.root.entries);
    });

    it("rebuilds a multi-bucket level into a single bucket level", async () => {
      const cursor = createCursor(blockstore, oddTree);
      const updts: Updts = {
        current: oddTreeEntries.map(toKey),
        user: [],
        next: [],
      };
      const state: State = {
        newRoot: null,
        removedBuckets: [],
      };
      const level = 0;

      const expected: ProllyTreeDiff[] = [
        {
          entries: oddTreeEntries.map((e) => [e, null]),
          buckets: [
            [null, emptyBucket],
            [
              await loadBucket(
                blockstore,
                oddTree.root.entries[0]!.val,
                {
                  isTail: true,
                  isHead: false,
                },
                {
                  range: ["MIN_KEY", oddTree.root.entries[0]!.key],
                },
              ),
              null,
            ],
            [
              await loadBucket(
                blockstore,
                oddTree.root.entries[1]!.val,
                {
                  isTail: false,
                  isHead: false,
                },
                {
                  range: [
                    oddTree.root.entries[0]!.key,
                    oddTree.root.entries[1]!.key,
                  ],
                },
              ),
              null,
            ],
            [
              await loadBucket(
                blockstore,
                oddTree.root.entries[2]!.val,
                {
                  isTail: true,
                  isHead: true,
                },
                {
                  range: [
                    oddTree.root.entries[1]!.key,
                    oddTree.root.entries[2]!.key,
                  ],
                },
              ),
              null,
            ],
            [oddTree.root, null],
          ],
        },
      ];

      let count = 0;
      for await (const { entries, buckets } of rebuildLevel(
        cursor,
        updts,
        state,
        average,
        level,
      )) {
        expect(entries).to.deep.equal(expected[count]?.entries);
        expect(buckets).to.deep.equal(expected[count]?.buckets);
        count++;
      }

      expect(state.newRoot).to.deep.equal(emptyTree.root);
      expect(state.removedBuckets).to.deep.equal([]);
    });
  });

  describe("mutate", () => {
    it("returns the same tree", async () => {
      const oddTreeCopy = cloneTree(oddTree);

      for await (const _ of mutate(blockstore, oddTreeCopy, [])) {
        expect.fail();
      }

      expect(oddTreeCopy.root).to.deep.equal(oddTree.root);
    });

    it("adds entries to empty tree", async () => {
      const emptyTreeCopy = cloneTree(emptyTree);
      const updates = [oddTreeEntries];

      const expected: ProllyTreeDiff[] = [
        {
          entries: oddTreeEntries.map((e) => [null, e]),
          buckets: [
            [emptyBucket, null],
            [
              null,
              await loadBucket(
                blockstore,
                oddTree.root.entries[0]!.val,
                {
                  isTail: true,
                  isHead: false,
                },
                {
                  range: ["MIN_KEY", oddTree.root.entries[0]!.key],
                },
              ),
            ],
            [
              null,
              await loadBucket(
                blockstore,
                oddTree.root.entries[1]!.val,
                {
                  isTail: false,
                  isHead: false,
                },
                {
                  range: [
                    oddTree.root.entries[0]!.key,
                    oddTree.root.entries[1]!.key,
                  ],
                },
              ),
            ],
            [
              null,
              await loadBucket(
                blockstore,
                oddTree.root.entries[2]!.val,
                {
                  isTail: true,
                  isHead: true,
                },
                {
                  range: [
                    oddTree.root.entries[1]!.key,
                    oddTree.root.entries[2]!.key,
                  ],
                },
              ),
            ],
          ],
        },
        {
          entries: [],
          buckets: [[null, oddTree.root]],
        },
      ];

      let count = 0;
      for await (const { entries, buckets } of mutate(
        blockstore,
        emptyTreeCopy,
        updates,
      )) {
        expect(entries).to.deep.equal(expected[count]?.entries);
        expect(buckets).to.deep.equal(expected[count]?.buckets);
        count++;
      }

      expect(emptyTreeCopy.root).to.deep.equal(oddTree.root);
    });

    it("removes all entries from a tree", async () => {
      const oddTreeCopy = cloneTree(oddTree);
      const updates = [oddTreeEntries.map(toKey)];

      const expected: ProllyTreeDiff[] = [
        {
          entries: oddTreeEntries.map((e) => [e, null]),
          buckets: [
            [null, emptyBucket],
            [
              await loadBucket(
                blockstore,
                oddTree.root.entries[0]!.val,
                {
                  isTail: true,
                  isHead: false,
                },
                {
                  range: ["MIN_KEY", oddTree.root.entries[0]!.key],
                },
              ),
              null,
            ],
            [
              await loadBucket(
                blockstore,
                oddTree.root.entries[1]!.val,
                {
                  isTail: false,
                  isHead: false,
                },
                {
                  range: [
                    oddTree.root.entries[0]!.key,
                    oddTree.root.entries[1]!.key,
                  ],
                },
              ),
              null,
            ],
            [
              await loadBucket(
                blockstore,
                oddTree.root.entries[2]!.val,
                {
                  isTail: true,
                  isHead: true,
                },
                {
                  range: [
                    oddTree.root.entries[1]!.key,
                    oddTree.root.entries[2]!.key,
                  ],
                },
              ),
              null,
            ],
            [oddTree.root, null],
          ],
        },
      ];

      let count = 0;
      for await (const { entries, buckets } of mutate(
        blockstore,
        oddTreeCopy,
        updates,
      )) {
        expect(entries).to.deep.equal(expected[count]?.entries);
        expect(buckets).to.deep.equal(expected[count]?.buckets);
        count++;
      }

      expect(oddTreeCopy.root).to.deep.equal(emptyTree.root);
    });
  });
});
