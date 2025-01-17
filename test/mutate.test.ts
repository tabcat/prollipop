import { describe, expect, it, vi } from "vitest";
import "../src/boundary.js"; // for the mock
import { MIN_TUPLE } from "../src/constants.js";
import { createCursor } from "../src/cursor.js";
import { ProllyTreeDiff } from "../src/diff.js";
import { cloneTree } from "../src/index.js";
import { Cursor, Entry } from "../src/interface.js";
import {
  State,
  Updts,
  applyUpdate,
  collectUpdates,
  exclusiveMax,
  getBucket,
  getUpdatee,
  getUserUpdateTuple,
  mutate,
  rebuildBucket,
  rebuildLevel,
} from "../src/mutate.js";
import {
  createBucket,
  createReusableAwaitIterable,
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
  entry,
  tuple,
} from "./helpers/constants.js";
import { oddTree, oddTreeEntries } from "./helpers/odd-tree.js";

vi.mock("../src/boundary.js");

describe("mutate", () => {
  describe("exclusiveMax", () => {
    const compareNums = (a: number, b: number) => a - b;
    const array = [1, 2, 3];

    it("returns 0 if boundary is lower than first element", () => {
      expect(exclusiveMax(array, 0, compareNums)).to.equal(0);
    });

    it("returns array length if boundary is higher than first element", () => {
      expect(exclusiveMax(array, 4, compareNums)).to.equal(array.length);
    });

    it("returns index of first element to fail", () => {
      expect(exclusiveMax(array, 2, compareNums)).to.equal(2);
    });
  });

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
      const updates = createReusableAwaitIterable([[tuple]]);

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
      const updates = createReusableAwaitIterable([[tuple]]);

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
        nextBucket: vi.fn(),
        currentBucket: () => bucket,
        isAtHead: () => false,
      } as unknown as Cursor;

      await getUpdatee(cursor, [entry], tuple, 0, 0);

      expect(cursor.nextBucket).toHaveBeenCalledOnce();
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

      await getUpdatee(cursor, [], tuple, 0, 0);

      expect(cursor.nextTuple).toHaveBeenCalledOnce();
    });

    it("returns jump to tuple if level has changed", async () => {
      const cursor: Cursor = {
        jumpTo: vi.fn(),
        isAtHead: () => false,
        isAtTail: () => false,
        currentBucket: () => bucket,
        rootLevel: () => 1,
        level: () => 0,
      } as unknown as Cursor;

      await getUpdatee(cursor, [], tuple, 0, 1);

      expect(cursor.jumpTo).toHaveBeenCalledOnce();
    });

    it("returns empty bucket on level if leftovers is empty and level > root level", async () => {
      const cursor = {
        currentBucket: () => bucket,
        rootLevel: () => 0,
      } as unknown as Cursor;

      const updatee = await getUpdatee(cursor, [], tuple, 0, 1);

      expect(updatee.average).to.equal(0);
      expect(updatee.level).to.equal(1);
      expect(updatee.entries.length).to.equal(0);
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

  describe("getBucket", () => {
    it("returns the original bucket if digests match", () => {
      expect(
        getBucket(bucket, bucket.entries, { isTail: true, isHead: true }),
      ).to.equal(bucket);
    });

    it("returns a new bucket if digests differ", () => {
      expect(
        getBucket(bucket, [], { isTail: true, isHead: true }),
      ).to.not.equal(bucket);
    });
  });

  describe("rebuildBucket", () => {
    const isBoundary = (e: Entry) => e.seq % 2 === 1;

    describe("basic operations", () => {
      it("returns original bucket when no changes needed", () => {
        const bucket = createBucket(
          average,
          0,
          [createEntry(0), createEntry(1)],
          { isTail: true, isHead: false },
        );
        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          [],
          [],
          true,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]).to.equal(bucket); // Same reference
        expect(leftover).to.deep.equal([]);
        expect(diff).to.deep.equal([]);
      });

      it("processes leftovers correctly", () => {
        const bucket = createBucket(average, 0, [createEntry(1)], {
          isTail: true,
          isHead: false,
        });
        const leftovers = [createEntry(0)];

        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          leftovers,
          [],
          true,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([
          createEntry(0),
          createEntry(1),
        ]);
        expect(leftover).to.deep.equal([]);
        expect(diff).to.deep.equal([]);
      });

      it("handles head bucket without boundary", () => {
        const context = { isTail: false, isHead: true };
        const bucket = createBucket(average, 0, [createEntry(0)], context);
        const [buckets] = rebuildBucket(
          bucket,
          [],
          [],
          false,
          true,
          0,
          () => false,
        );

        expect(buckets).to.have.length(1);
        expect(buckets[0]!.entries).to.deep.equal([createEntry(0)]);
      });
    });

    describe("updates", () => {
      it("handles add updates", () => {
        const context = { isTail: true, isHead: false };
        const bucket = createBucket(average, 0, [createEntry(1)], context);
        const updates = [createEntry(0)];

        const [buckets, _, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          true,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([
          createEntry(0),
          createEntry(1),
        ]);
        expect(diff).to.deep.equal([[null, createEntry(0)]]);
      });

      it("handles remove updates", () => {
        const entries = [createEntry(0), createEntry(1)];
        const context = { isTail: true, isHead: false };
        const bucket = createBucket(average, 0, entries, context);
        const updates = [entryToTuple(entries[0]!)];

        const [buckets, _, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          true,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([createEntry(1)]);
        expect(diff).to.deep.equal([[entries[0], null]]);
      });

      it("handles strict remove updates", () => {
        const entries = [createEntry(0), createEntry(1)];
        const context = { isTail: true, isHead: false };
        const bucket = createBucket(average, 0, entries, context);
        const updates = [{ ...entries[0]!, strict: true }];

        const [buckets, _, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          true,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([createEntry(1)]);
        expect(diff).to.deep.equal([[entries[0], null]]);
      });
    });

    // Boundary handling tests
    describe("boundary handling", () => {
      it("splits bucket at boundaries", () => {
        const context = { isTail: true, isHead: false };
        const bucket = createBucket(
          average,
          0,
          [createEntry(0), createEntry(2), createEntry(3)],
          context,
        );

        const [buckets] = rebuildBucket(
          bucket,
          [],
          [createEntry(1)],
          true,
          false,
          0,
          isBoundary,
        );

        expect(buckets).to.have.length(2);
        expect(buckets[0]!.entries).to.deep.equal([
          createEntry(0),
          createEntry(1),
        ]);
        expect(buckets[1]!.entries).to.deep.equal([
          createEntry(2),
          createEntry(3),
        ]);
      });
    });

    describe("edge cases", () => {
      it("handles empty bucket", () => {
        const context = { isTail: true, isHead: true };
        const bucket = createBucket(average, 0, [], context);
        const [buckets] = rebuildBucket(
          bucket,
          [],
          [],
          true,
          true,
          0,
          isBoundary,
        );

        expect(buckets).to.have.length(1);
        expect(buckets[0]!.entries).to.deep.equal([]);
      });

      it("handles complete removal of entries", () => {
        const entries = [createEntry(0), createEntry(1)];
        const context = { isTail: true, isHead: true };
        const bucket = createBucket(average, 0, entries, context);
        const updates = entries.map(entryToTuple);

        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          false,
          false,
          0,
          isBoundary,
        );

        expect(buckets).to.have.length(0);
        expect(leftover).to.deep.equal([]);
        expect(diff).to.have.length(2);
      });

      it("handles complete removal with isTail=true and isHead=true", () => {
        const entries = [createEntry(0), createEntry(1)];
        const context = { isTail: true, isHead: true };
        const bucket = createBucket(average, 0, entries, context);
        const updates = entries.map(entryToTuple);

        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          true,
          true,
          0,
          isBoundary,
        );

        expect(buckets).to.have.length(1);
        expect(leftover).to.deep.equal([]);
        expect(diff).to.have.length(2);
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
