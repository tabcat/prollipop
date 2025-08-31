import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  cloneCursorState,
  createCursor,
  createCursorState,
  preMove,
  preWrite,
} from "../src/cursor.js";
import { Cursor } from "../src/interface.js";
import { createBucket } from "../src/utils.js";
import { createProllyTreeEntry } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  bucket,
  createKey,
  emptyBucket,
} from "./helpers/constants.js";
import { oddTree, oddTreeEntries, oddTreeIds } from "./helpers/odd-tree.js";

vi.mock("../src/boundary.js");

describe("cursor", () => {
  describe("createCursor", () => {
    it("creates a new cursor instance", () => {
      const cursor = createCursor(blockstore, { root: bucket });
      expect(cursor.index()).to.equal(0);
      expect(cursor.done()).to.equal(false);
    });

    it("creates a new cursor instance for an empty bucket", () => {
      const cursor = createCursor(blockstore, { root: emptyBucket });
      expect(cursor.index()).to.equal(-1);
      expect(cursor.done()).to.equal(true);
    });

    describe("cursor", () => {
      let cursor: Cursor;

      beforeAll(async () => {
        cursor = createCursor(blockstore, oddTree);
        await cursor.next(0);
      });

      describe("level", () => {
        it("returns the current level of the cursor", async () => {
          expect(cursor.level()).to.equal(0);
        });
      });

      describe("rootLevel", () => {
        it("returns the root level of the tree", async () => {
          expect(cursor.rootLevel()).to.equal(1);
        });
      });

      describe("current", () => {
        it("returns the current entry", () => {
          expect(cursor.current()).to.deep.equal(
            createProllyTreeEntry(0, 0, oddTreeIds),
          );
        });

        it("throws if called on empty bucket", () => {
          const cursor = createCursor(blockstore, { root: emptyBucket });
          expect(() => cursor.current()).toThrow(
            "Failed to return current entry from empty bucket.",
          );
        });
      });

      describe("buckets", () => {
        it("returns an array of buckets from root to current bucket", async () => {
          const leaf = createBucket(average, 0, oddTreeEntries.slice(0, 2), {
            isTail: true,
            isHead: false,
          });
          expect(cursor.buckets()).to.deep.equal([oddTree.root, leaf]);
        });
      });

      describe("currentBucket", () => {
        it("returns the current bucket", () => {
          const leaf = createBucket(average, 0, oddTreeEntries.slice(0, 2), {
            isTail: true,
            isHead: false,
          });
          expect(cursor.currentBucket()).to.deep.equal(leaf);
        });
      });

      it("wraps cursor writes with check if locked", () => {
        const cursor = createCursor(blockstore, oddTree);

        cursor.next(0);
        expect(cursor.locked()).to.equal(true);
        expect(cursor.next(0)).rejects.toThrow(
          "Failed to acquire cursor lock.",
        );
      });

      it("wraps cursor writes with check if done", async () => {
        const cursor = createCursor(blockstore, { root: emptyBucket });

        expect(cursor.done()).to.equal(true);

        await cursor.next(0);

        expect(cursor.done()).to.equal(true);
      });

      it("wraps cursor moves with check if mogged", async () => {
        const cursor = createCursor(blockstore, oddTree);

        await cursor.next(cursor.rootLevel() + 1);
        expect(cursor.done()).to.equal(true);
      });

      describe("next", () => {
        it("sets cursor to done if last entry on level", async () => {
          const cursor = createCursor(blockstore, { root: bucket });

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.next();

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(true);
        });

        it("increments cursor index on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.next();

          expect(cursor.index()).to.equal(1);
          expect(cursor.done()).to.equal(false);
        });

        it("does not increment cursor index when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(1);

          await cursor.next(0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);
        });

        it("increments cursor index when moving to a higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.next(0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);

          await cursor.next(1);

          expect(cursor.index()).to.equal(1);
          expect(cursor.level()).to.equal(1);
        });
      });

      describe("nextBucket", () => {
        it("sets the cursor to done if last bucket on the level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.nextBucket();

          expect(cursor.index()).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.done()).to.equal(true);
        });

        it("increments bucket on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextBucket(0);

          expect(cursor.currentBucket()).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(0, 2), {
              isTail: true,
              isHead: false,
            }),
          );
          expect(cursor.level()).to.equal(0);

          await cursor.nextBucket();

          expect(cursor.currentBucket()).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(2, 4), {
              isTail: false,
              isHead: true,
            }),
          );
          expect(cursor.level()).to.equal(0);
        });

        it("increments bucket when moving to higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextBucket(0);

          expect(cursor.currentBucket()).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(0, 2), {
              isTail: true,
              isHead: false,
            }),
          );
          expect(cursor.level()).to.equal(0);
          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.nextBucket(1);

          expect(cursor.currentBucket()).to.equal(oddTree.root);
          expect(cursor.level()).to.equal(1);
          expect(cursor.index()).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.done()).to.equal(true);
        });

        it("does not increment bucket when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(1);

          await cursor.nextBucket(0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);
        });
      });

      describe("nextKey", () => {
        it("sets the cursor to done if tuple exceeds max tuple of tree", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.nextKey("MAX_KEY");

          expect(cursor.index()).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.done()).to.equal(true);
        });

        it("moves cursor to key on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(1);
          expect(cursor.done()).to.equal(false);

          await cursor.nextKey(createKey(3));

          expect(cursor.index()).to.equal(1);
          expect(cursor.level()).to.equal(1);
          expect(cursor.done()).to.equal(false);
        });

        it("moves cursor to key when moving to higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextKey("MIN_KEY", 0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);

          await cursor.nextKey(createKey(3), 1);

          expect(cursor.index()).to.equal(1);
          expect(cursor.level()).to.equal(1);
        });

        it("moves cursor to key when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextKey("MIN_KEY", 0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);

          await cursor.nextKey(createKey(3));

          expect(cursor.index()).to.equal(1);
          expect(cursor.level()).to.equal(0);
        });
      });

      describe("jumpTo", () => {
        it("jumps to the domain of the tuple at the requested level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.next();

          expect(cursor.level()).to.equal(1);
          expect(cursor.index()).to.equal(1);

          await cursor.jumpTo(new Uint8Array(), 0);

          expect(cursor.level()).to.equal(0);
          expect(cursor.index()).to.equal(0);
        });

        it("rejects if jumping to level higher than root", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(
            cursor.jumpTo(new Uint8Array(), cursor.rootLevel() + 1),
          ).rejects.toThrow("Cannot jump to level higher than root.");
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
      await preWrite(0, state, async () => {
        state.isDone = false;
      });
      expect(state.isDone).to.equal(true);
    });

    it("rejects if cursor is locked", async () => {
      const state = createCursorState(blockstore, oddTree);
      state.isLocked = true;
      expect(
        preWrite(0, state, async () => {
          expect.fail();
        }),
      ).rejects.toThrow("Failed to acquire cursor lock.");
    });

    it("locks the cursor state", () => {
      const state = createCursorState(blockstore, oddTree);
      preWrite(0, state, async () => {});
      expect(state.isLocked).to.equal(true);
    });
  });

  describe("preMove", () => {
    it("sets cursor to done and returns if level > root level", async () => {
      const state = createCursorState(blockstore, oddTree);
      await preMove(10, state, async () => {
        expect.fail();
      });
      expect(state.isDone).to.equal(true);
    });
  });
});
