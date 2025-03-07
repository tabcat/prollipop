import { describe, expect, it, vi } from "vitest";
import "../src/boundary.js"; // for the mock
import { MIN_TUPLE } from "../src/constants.js";
import { createCursor } from "../src/cursor.js";
import { EntryDiff, ProllyTreeDiff } from "../src/diff.js";
import { cloneTree } from "../src/index.js";
import { Cursor, Entry } from "../src/interface.js";
import {
  State,
  Updts,
  applyUpdate,
  collectUpdates,
  createGetUpdatee,
  getUserUpdateTuple,
  mutate,
  rebuildLevel,
  segmentEntries,
} from "../src/mutate.js";
import {
  createSharedAwaitIterable,
  entryToTuple,
  loadBucket,
} from "../src/utils.js";
import {
  average,
  blockstore,
  bucket,
  createEntry,
  emptyBucket,
  emptyTree,
  tuple,
} from "./helpers/constants.js";
import { oddTree, oddTreeEntries } from "./helpers/odd-tree.js";

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
      const update = entryToTuple({ ...entry });

      it("returns [null, null] if entry does not exist", () => {
        expect(applyUpdate(null, update)).to.deep.equal([null, null]);
      });

      it("returns [null, [entry, null]] if entry exists", () => {
        expect(applyUpdate(entry, update)).to.deep.equal([null, [entry, null]]);
      });
    });
  });

  describe("getUserUpdateTuple", () => {
    it("returns a tuple from updts.user", async () => {
      const updates = createSharedAwaitIterable([[tuple]]);

      const level = 0;
      const updts: Updts = {
        current: [],
        user: updates,
        next: [],
      };

      const currentTuple = await getUserUpdateTuple(updts, level);

      expect(currentTuple).to.equal(tuple);
      expect(updts.current.length).to.equal(1);
    });

    it("returns null if updts.user is empty", async () => {
      const level = 0;
      const updts: Updts = {
        current: [],
        user: [],
        next: [],
      };
      const currentTuple = await getUserUpdateTuple(updts, level);

      expect(currentTuple).to.equal(null);
    });

    it("returns null if level > 0", async () => {
      const updates = createSharedAwaitIterable([[tuple]]);

      const level = 1;
      const updts: Updts = {
        current: [],
        user: updates,
        next: [],
      };

      const currentTuple = await getUserUpdateTuple(updts, level);

      expect(currentTuple).to.equal(null);
      expect(updts.current.length).to.equal(0);
    });
  });

  describe("getUpdatee", () => {
    it("returns next bucket if leftovers is not empty", async () => {
      const cursor = {
        nextTuple: vi.fn(),
        currentBucket: () => bucket,
        isAtHead: () => false,
        rootLevel: () => 0,
        level: () => 0,
      } as unknown as Cursor;
      const getUpdatee = createGetUpdatee(average, 0, cursor);

      await getUpdatee(tuple, false);

      expect(cursor.nextTuple).toHaveBeenCalledOnce();
    });

    it("returns next tuple if level has not changed", async () => {
      const cursor: Cursor = {
        nextTuple: vi.fn(),
        isAtHead: () => false,
        isAtTail: () => false,
        currentBucket: () => bucket,
        rootLevel: () => 0,
        level: () => 0,
      } as unknown as Cursor;
      const getUpdatee = createGetUpdatee(average, 0, cursor);

      await getUpdatee(tuple, false);

      expect(cursor.nextTuple).toHaveBeenCalledOnce();
    });

    it("returns jump to tuple if level has changed", async () => {
      const cursor: Cursor = {
        nextTuple: vi.fn(),
        isAtHead: () => false,
        isAtTail: () => false,
        currentBucket: () => bucket,
        rootLevel: () => 1,
        level: () => 0,
      } as unknown as Cursor;
      const getUpdatee = createGetUpdatee(average, 0, cursor);

      await getUpdatee(tuple, false);

      expect(cursor.nextTuple).toHaveBeenCalledOnce();
    });

    it("returns empty bucket on level if leftovers is empty and level > root level", async () => {
      const cursor = {
        jumpTo: vi.fn(),
        currentBucket: () => bucket,
        rootLevel: () => 0,
        level: () => 1,
      } as unknown as Cursor;
      const getUpdatee = createGetUpdatee(average, 0, cursor);

      const updatee = await getUpdatee(tuple, false);

      expect(updatee).to.not.equal(null);

      const context = updatee!.getContext();

      expect(context.isTail).to.be.true;
      expect(context.isHead).to.be.true;
      expect(cursor.jumpTo).toHaveBeenCalledOnce();
    });
  });

  describe("collectUpdates", () => {
    const entries = [0, 1, 2, 3].map(createEntry);

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
        entries.filter((e) => e.seq !== 1 && e.seq !== 3),
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
    const isBoundary = (e: Entry) => e.seq % 2 === 1;

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
        const updates = [entryToTuple(currentEntries[0]!)];

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
        const updates = currentEntries.map(entryToTuple);

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
                  range: [MIN_TUPLE, entryToTuple(oddTree.root.entries[0]!)],
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
                    entryToTuple(oddTree.root.entries[0]!),
                    entryToTuple(oddTree.root.entries[1]!),
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
                    entryToTuple(oddTree.root.entries[1]!),
                    entryToTuple(oddTree.root.entries[2]!),
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
        current: oddTreeEntries.map(entryToTuple),
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
                  range: [MIN_TUPLE, entryToTuple(oddTree.root.entries[0]!)],
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
                    entryToTuple(oddTree.root.entries[0]!),
                    entryToTuple(oddTree.root.entries[1]!),
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
                    entryToTuple(oddTree.root.entries[1]!),
                    entryToTuple(oddTree.root.entries[2]!),
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
                  range: [MIN_TUPLE, entryToTuple(oddTree.root.entries[0]!)],
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
                    entryToTuple(oddTree.root.entries[0]!),
                    entryToTuple(oddTree.root.entries[1]!),
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
                    entryToTuple(oddTree.root.entries[1]!),
                    entryToTuple(oddTree.root.entries[2]!),
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
      const updates = [oddTreeEntries.map(entryToTuple)];

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
                  range: [MIN_TUPLE, entryToTuple(oddTree.root.entries[0]!)],
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
                    entryToTuple(oddTree.root.entries[0]!),
                    entryToTuple(oddTree.root.entries[1]!),
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
                    entryToTuple(oddTree.root.entries[1]!),
                    entryToTuple(oddTree.root.entries[2]!),
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
