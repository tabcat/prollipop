import { beforeAll, describe, expect, it, vi } from "vitest";
import "../src/boundary.js";
import { minTuple } from "../src/constants.js";
import { Cursor, createCursor } from "../src/cursor.js";
import { createBucket } from "../src/utils.js";
import { createProllyTreeEntry } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  bucket,
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
          const leaf = createBucket(average, 0, oddTreeEntries.slice(0, 2));
          expect(cursor.buckets()).to.deep.equal([oddTree.root, leaf]);
        });
      });

      describe("currentBucket", () => {
        it("returns the current bucket", () => {
          const leaf = createBucket(average, 0, oddTreeEntries.slice(0, 2));
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
            createBucket(average, 0, oddTreeEntries.slice(0, 2)),
          );
          expect(cursor.level()).to.equal(0);

          await cursor.nextBucket();

          expect(cursor.currentBucket()).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(2, 4)),
          );
          expect(cursor.level()).to.equal(0);
        });

        it("increments bucket when moving to higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextBucket(0);

          expect(cursor.currentBucket()).to.deep.equal(
            createBucket(average, 0, oddTreeEntries.slice(0, 2)),
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

      describe("nextTuple", () => {
        const highTuple = { seq: Infinity, key: new Uint8Array() };

        it("sets the cursor to done if tuple exceeds max tuple of tree", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.nextTuple(highTuple);

          expect(cursor.index()).to.equal(oddTree.root.entries.length - 1);
          expect(cursor.done()).to.equal(true);
        });

        it("moves cursor to tuple on same level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(1);
          expect(cursor.done()).to.equal(false);

          await cursor.nextTuple({ seq: 3, key: new Uint8Array() });

          expect(cursor.index()).to.equal(1);
          expect(cursor.level()).to.equal(1);
          expect(cursor.done()).to.equal(false);
        });

        it("moves cursor to tuple when moving to higher level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextTuple(minTuple, 0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);

          await cursor.nextTuple({ seq: 3, key: new Uint8Array() }, 1);

          expect(cursor.index()).to.equal(1);
          expect(cursor.level()).to.equal(1);
        });

        it("moves cursor to tuple when moving to a lower level", async () => {
          const cursor = createCursor(blockstore, oddTree);

          await cursor.nextTuple(minTuple, 0);

          expect(cursor.index()).to.equal(0);
          expect(cursor.level()).to.equal(0);

          await cursor.nextTuple({ seq: 3, key: new Uint8Array() });

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

          await cursor.jumpTo({ seq: 0, key: new Uint8Array() }, 0);

          expect(cursor.level()).to.equal(0);
          expect(cursor.index()).to.equal(0);
        });

        it("rejects if jumping to level higher than root", async () => {
          const cursor = createCursor(blockstore, oddTree);

          expect(
            cursor.jumpTo(
              { seq: 0, key: new Uint8Array() },
              cursor.rootLevel() + 1,
            ),
          ).rejects.toThrow("Cannot jump to level higher than root.");
        });
      });
    });
  });
});
