import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  Cursor,
  createCursor,
  nextBucket,
  nextEntry,
  resetToKey,
  skipToKey,
} from "../src/cursor/index.js";
import {
  cloneCursorState,
  createCursorState,
  getBucketKeyRange,
  getCurrentBucket,
  getCurrentEntry,
  getCurrentLevel,
  getKeyRange,
  getRootLevel,
  preMove,
  preWrite,
} from "../src/cursor/internal.js";
import { createBucket } from "../src/utils.js";
import { createProllyTreeEntry } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  bucket,
  emptyBucket,
  emptyTree,
} from "./helpers/constants.js";
import {
  oddTree,
  oddTreeEntries,
  oddTreeIds,
  oddTreeState,
} from "./helpers/odd-tree.js";
import { createKey } from "./helpers/utils.js";

vi.mock("../src/boundary.js");

describe("cursor", () => {
  describe("createCursor", () => {
    it("creates a new cursor instance", () => {
      const cursor = createCursor(blockstore, { root: bucket });
      expect(cursor.currentIndex).to.equal(0);
      expect(cursor.isDone).to.equal(false);
    });

    it("creates a new cursor instance for an empty bucket", () => {
      const cursor = createCursor(blockstore, { root: emptyBucket });
      expect(cursor.currentIndex).to.equal(-1);
      expect(cursor.isDone).to.equal(true);
    });

    describe("getKeyRange", () => {
      it("gets the key range for an empty tree", () => {
        const cursor = createCursor(blockstore, emptyTree);
        const keyRange = getKeyRange(cursor);

        expect(keyRange).to.deep.equal(["MIN_KEY", "MAX_KEY"]);
      });

      it("gets the key range for the first entry at root", () => {
        const cursor = createCursor(blockstore, oddTree);
        const keyRange = getKeyRange(cursor);

        expect(keyRange).to.deep.equal(["MIN_KEY", createKey(1)]);
      });

      it("gets the key range for an internal leaf entry", () => {
        const cursor = createCursor(blockstore, oddTree);
        cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![1]!];
        const keyRange = getKeyRange(cursor);

        expect(keyRange).to.deep.equal([
          oddTreeState[0]![0]!.entries[0]!.key,
          createKey(2),
        ]);
      });

      describe("getBucketKeyRange", () => {
        it("gets the bucket key range for an empty tree", () => {
          const cursor = createCursor(blockstore, emptyTree);
          const keyRange = getBucketKeyRange(cursor);

          expect(keyRange).to.deep.equal(["MIN_KEY", "MAX_KEY"]);
        });

        it("gets the bucket key range for the first entry at root", () => {
          const cursor = createCursor(blockstore, oddTree);
          const keyRange = getBucketKeyRange(cursor);

          expect(keyRange).to.deep.equal(["MIN_KEY", createKey(5)]);
        });

        it("gets the bucket key range for an internal leaf entry", () => {
          const cursor = createCursor(blockstore, oddTree);
          cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![1]!];
          const keyRange = getBucketKeyRange(cursor);

          expect(keyRange).to.deep.equal([
            oddTreeState[0]![0]!.entries[0]!.key,
            createKey(3),
          ]);
        });

        it("gets the bucket key range for the first leaf entry", () => {
          const cursor = createCursor(blockstore, oddTree);
          cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![0]!];
          const keyRange = getBucketKeyRange(cursor);

          expect(keyRange).to.deep.equal(["MIN_KEY", createKey(1)]);
        });
      });

      it("gets the bucket key range for the first leaf entry", () => {
        const cursor = createCursor(blockstore, oddTree);
        cursor.currentBuckets = [oddTreeState[0]![0]!, oddTreeState[1]![0]!];
        const keyRange = getKeyRange(cursor);

        expect(keyRange).to.deep.equal(["MIN_KEY", createKey(0)]);
      });
    });

    describe("cursor", () => {
      let cursor: Cursor;

      beforeAll(async () => {
        cursor = createCursor(blockstore, oddTree);
        await nextEntry(cursor, 0);
      });

      describe("level", () => {
        it("returns the current level of the cursor", async () => {
          expect(getCurrentLevel(cursor)).to.equal(0);
        });
      });

      describe("rootLevel", () => {
        it("returns the root level of the tree", async () => {
          expect(getRootLevel(cursor)).to.equal(1);
        });
      });

      describe("current", () => {
        it("returns the current entry", () => {
          expect(getCurrentEntry(cursor)).to.deep.equal(
            createProllyTreeEntry(0, 0, oddTreeIds),
          );
        });

        it("throws if called on empty bucket", () => {
          const cursor = createCursor(blockstore, { root: emptyBucket });
          expect(() => getCurrentEntry(cursor)).toThrow(
            "there is no current entry.",
          );
        });
      });

      describe("buckets", () => {
        it("returns an array of buckets from root to current bucket", async () => {
          const leaf = createBucket(average, 0, oddTreeEntries.slice(0, 2), {
            isTail: true,
            isHead: false,
          });
          expect(cursor.currentBuckets).to.deep.equal([oddTree.root, leaf]);
        });
      });

      describe("currentBucket", () => {
        it("returns the current bucket", () => {
          const leaf = createBucket(average, 0, oddTreeEntries.slice(0, 2), {
            isTail: true,
            isHead: false,
          });
          expect(getCurrentBucket(cursor)).to.deep.equal(leaf);
        });
      });

      it("wraps cursor writes with check if locked", () => {
        const cursor = createCursor(blockstore, oddTree);

        nextEntry(cursor, 0);
        expect(cursor.isLocked).to.equal(true);
        expect(nextEntry(cursor, 0)).rejects.toThrow(
          "Failed to acquire cursor lock.",
        );
      });

      it("wraps cursor writes with check if done", async () => {
        const cursor = createCursor(blockstore, { root: emptyBucket });

        expect(cursor.isDone).to.equal(true);

        await nextEntry(cursor, 0);

        expect(cursor.isDone).to.equal(true);
      });

      it("wraps cursor moves with check if mogged", async () => {
        const cursor = createCursor(blockstore, oddTree);

        await nextEntry(cursor, getRootLevel(cursor) + 1);
        expect(cursor.isDone).to.equal(true);
      });

      describe("next", () => {
        it("sets cursor to done if last entry on level", async () => {
          const cursor = createCursor(blockstore, { root: bucket });

          expect(cursor.currentIndex).to.equal(0);
          expect(cursor.isDone).to.equal(false);

          await nextEntry(cursor);

          expect(cursor.currentIndex).to.equal(0);
          expect(cursor.isDone).to.equal(true);
        });

        it("increments cursor index on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.currentIndex).to.equal(0);
          expect(cursor.isDone).to.equal(false);

          await nextEntry(cursor);

          expect(cursor.currentIndex).to.equal(1);
          expect(cursor.isDone).to.equal(false);
        });

        it("does not increment cursor index when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(1);

          await nextEntry(cursor, 0);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(0);
        });

        it("increments cursor index when moving to a higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await nextEntry(cursor, 0);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(0);

          await nextEntry(cursor, 1);

          expect(cursor.currentIndex).to.equal(1);
          expect(getCurrentLevel(cursor)).to.equal(1);
        });
      });

      describe("nextBucket", () => {
        it("sets the cursor to done if last bucket on the level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.currentIndex).to.equal(0);
          expect(cursor.isDone).to.equal(false);

          await nextBucket(cursor);

          expect(cursor.currentIndex).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.isDone).to.equal(true);
        });

        it("increments bucket on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await nextBucket(cursor, 0);

          expect(getCurrentBucket(cursor)).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(0, 2), {
              isTail: true,
              isHead: false,
            }),
          );
          expect(getCurrentLevel(cursor)).to.equal(0);

          await nextBucket(cursor);

          expect(getCurrentBucket(cursor)).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(2, 4), {
              isTail: false,
              isHead: true,
            }),
          );
          expect(getCurrentLevel(cursor)).to.equal(0);
        });

        it("increments bucket when moving to higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await nextBucket(cursor, 0);

          expect(getCurrentBucket(cursor)).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(0, 2), {
              isTail: true,
              isHead: false,
            }),
          );
          expect(getCurrentLevel(cursor)).to.equal(0);
          expect(cursor.currentIndex).to.equal(0);
          expect(cursor.isDone).to.equal(false);

          await nextBucket(cursor, 1);

          expect(getCurrentBucket(cursor)).to.equal(oddTree.root);
          expect(getCurrentLevel(cursor)).to.equal(1);
          expect(cursor.currentIndex).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.isDone).to.equal(true);
        });

        it("does not increment bucket when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(1);

          await nextBucket(cursor, 0);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(0);
        });
      });

      describe("nextKey", () => {
        it("sets the cursor to done if key exceeds max key of tree", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.currentIndex).to.equal(0);
          expect(cursor.isDone).to.equal(false);

          await skipToKey(cursor, "MAX_KEY");

          expect(cursor.currentIndex).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.isDone).to.equal(true);
        });

        it("moves cursor to key on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(1);
          expect(cursor.isDone).to.equal(false);

          await skipToKey(cursor, createKey(3));

          expect(cursor.currentIndex).to.equal(1);
          expect(getCurrentLevel(cursor)).to.equal(1);
          expect(cursor.isDone).to.equal(false);
        });

        it("moves cursor to key when moving to higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await skipToKey(cursor, "MIN_KEY", 0);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(0);

          await skipToKey(cursor, createKey(3), 1);

          expect(cursor.currentIndex).to.equal(1);
          expect(getCurrentLevel(cursor)).to.equal(1);
        });

        it("moves cursor to key when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await skipToKey(cursor, "MIN_KEY", 0);

          expect(cursor.currentIndex).to.equal(0);
          expect(getCurrentLevel(cursor)).to.equal(0);

          await skipToKey(cursor, createKey(3));

          expect(cursor.currentIndex).to.equal(1);
          expect(getCurrentLevel(cursor)).to.equal(0);
        });
      });

      describe("jumpTo", () => {
        it("jumps to the domain of the key at the requested level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await nextEntry(cursor);

          expect(getCurrentLevel(cursor)).to.equal(1);
          expect(cursor.currentIndex).to.equal(1);

          await resetToKey(cursor, new Uint8Array(), 0);

          expect(getCurrentLevel(cursor)).to.equal(0);
          expect(cursor.currentIndex).to.equal(0);
        });

        it("rejects if jumping to level higher than root", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(
            resetToKey(cursor, new Uint8Array(), getRootLevel(cursor) + 1),
          ).rejects.toThrow("Cannot jump to level higher than root.");
        });

        it("reset cursor.isDone to false", async () => {
          const cursor = createCursor(blockstore, oddTree);
          cursor.isDone = true;

          await resetToKey(cursor, "MIN_KEY");

          expect(cursor.isDone).to.equal(false);
        });
      });
    });
  });

  describe("createCursorState", () => {
    it("creates a new cursor state", () => {
      const state = createCursorState(blockstore, oddTree);
      expect(state.currentIndex).to.equal(0);
      expect(state.isDone).to.equal(false);
      expect(state.isLocked).to.equal(false);
    });

    it("creates a new cursor state for an empty tree", () => {
      const state = createCursorState(blockstore, { root: emptyBucket });
      expect(state.currentIndex).to.equal(-1);
      expect(state.isDone).to.equal(true);
      expect(state.isLocked).to.equal(false);
    });
  });

  describe("cloneCursorState", () => {
    it("clones the cursor state", () => {
      const state = createCursorState(blockstore, oddTree);
      const cloned = cloneCursorState(state);

      cloned.currentBuckets.length = 0;

      expect(state.currentBuckets).to.not.deep.equal(cloned.currentBuckets);
    });
  });

  describe("preWrite", () => {
    it("returns if cursor is done", async () => {
      const state = createCursorState(blockstore, oddTree);
      state.isDone = true;
      await preWrite(state, 0, async () => {
        state.isDone = false;
      });
      expect(state.isDone).to.equal(true);
    });

    it("rejects if cursor is locked", async () => {
      const state = createCursorState(blockstore, oddTree);
      state.isLocked = true;
      expect(
        preWrite(state, 0, async () => {
          expect.fail();
        }),
      ).rejects.toThrow("Failed to acquire cursor lock.");
    });

    it("locks the cursor state", () => {
      const state = createCursorState(blockstore, oddTree);
      preWrite(state, 0, async () => {});
      expect(state.isLocked).to.equal(true);
    });
  });

  describe("preMove", () => {
    it("sets cursor to done and returns if level > root level", async () => {
      const state = createCursorState(blockstore, oddTree);
      await preMove(state, 10, async () => {
        expect.fail();
      });
      expect(state.isDone).to.equal(true);
    });
  });
});
