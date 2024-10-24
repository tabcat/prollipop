import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import { describe, expect, it } from "vitest";
import { createCursor } from "../src/cursor.js";
import { Tuple } from "../src/interface.js";
import {
  blockstore,
  bucket,
  emptyBucket,
  trees,
  treesToStates,
} from "./helpers/constants.js";

const lowTuple: Tuple = { seq: 0, key: new Uint8Array() };
const highTuple: Tuple = { seq: Infinity, key: new Uint8Array() };

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
      describe("level", () => {
        it("returns the current level of the cursor", () => {
          for (const tree of trees) {
            const cursor = createCursor(blockstore, tree);
            expect(cursor.level()).to.equal(
              lastElement(cursor.buckets()).level,
            );
          }
        });
      });

      describe("rootLevel", () => {
        it("returns the root level of the tree", () => {
          for (const tree of trees) {
            const cursor = createCursor(blockstore, tree);
            expect(cursor.rootLevel()).to.equal(
              firstElement(cursor.buckets()).level,
            );
          }
        });
      });

      describe("index", () => {
        it("returns the index of the current node", () => {
          const cursor = createCursor(blockstore, { root: bucket });
          expect(cursor.index()).to.equal(
            lastElement(cursor.buckets()).entries.indexOf(cursor.current()),
          );
        });

        it("returns -1 if the bucket is empty", () => {
          const cursor = createCursor(blockstore, { root: emptyBucket });
          expect(cursor.index()).to.equal(-1);
        });
      });

      describe("current", () => {
        it("returns the current node", () => {
          const cursor = createCursor(blockstore, { root: bucket });
          expect(cursor.current()).to.deep.equal(firstElement(bucket.entries));
        });

        it("throws if called on empty bucket", () => {
          const cursor = createCursor(blockstore, { root: emptyBucket });
          expect(() => cursor.current()).toThrow(
            "Failed to return current node from empty bucket.",
          );
        });
      });

      describe("buckets", () => {
        it("returns an array of buckets from root to current bucket", () => {
          const cursor = createCursor(blockstore, { root: bucket });
          expect(cursor.buckets()).to.deep.equal([bucket]);
        });
      });

      describe("currentBucket", () => {
        it("returns the current bucket", () => {
          const cursor = createCursor(blockstore, { root: bucket });
          expect(cursor.currentBucket()).to.deep.equal(bucket);
        });
      });

      it("wraps cursor writes with check if locked", () => {
        const cursor = createCursor(blockstore, { root: bucket });

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
        for (const tree of trees) {
          const cursor = createCursor(blockstore, tree);

          await cursor.next(cursor.rootLevel() + 1);
          expect(cursor.done()).to.equal(true);
        }
      });

      describe("next", () => {
        it("sets cursor to done if last node on level", async () => {
          const cursor = createCursor(blockstore, { root: bucket });

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.next();

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(true);
        });

        it("increments cursor index on same level", async () => {
          for (const tree of trees) {
            if (tree.root.entries.length <= 1) {
              continue;
            }

            const cursor = createCursor(blockstore, tree);

            await cursor.next();

            expect(cursor.index()).to.equal(1);
          }
        });

        it("increments cursor index when moving to a higher level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }

            const cursor = createCursor(blockstore, tree);

            await cursor.next(0);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(0);

            await cursor.next(cursor.rootLevel());

            expect(cursor.index()).to.equal(1);
            expect(cursor.level()).to.equal(cursor.rootLevel());
          }
        });

        it("does not increment cursor index when moving to a lower level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }

            const cursor = createCursor(blockstore, tree);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(cursor.rootLevel());

            await cursor.next(0);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(0);
          }
        });
      });

      describe("nextBucket", () => {
        it("sets the cursor to done if last bucket on the level", async () => {
          const cursor = createCursor(blockstore, { root: bucket });

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.nextBucket();

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(true);
        });

        it("increments bucket on same level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            await cursor.nextBucket(0);

            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );

            await cursor.nextBucket(0);

            expect(cursor.currentBucket()).to.deep.equal(
              ithElement(lastElement(state), 1),
            );
          }
        });

        it("increments bucket when moving to higher level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            await cursor.nextBucket(0);

            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );

            await cursor.nextBucket(cursor.rootLevel() - 1);

            expect(cursor.currentBucket()).to.deep.equal(
              ithElement(ithElement(state, 1), 1),
            );
          }
        });

        it("does not increment bucket when moving to a lower level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            await cursor.nextBucket(0);

            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );
          }
        });
      });

      describe("nextTuple", () => {
        it("sets the cursor to done if tuple exceeds max tuple of tree", async () => {
          const cursor = createCursor(blockstore, { root: bucket });

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(false);

          await cursor.nextTuple(highTuple);

          expect(cursor.index()).to.equal(0);
          expect(cursor.done()).to.equal(true);
        });

        it("moves cursor to tuple on same level", async () => {
          for (const tree of trees) {
            if (tree.root.entries.length <= 1) {
              continue;
            }

            const cursor = createCursor(blockstore, tree);

            await cursor.nextTuple(lastElement(cursor.currentBucket().entries));

            expect(cursor.index()).to.equal(
              cursor.currentBucket().entries.length - 1,
            );
            expect(cursor.done()).to.equal(false);
          }
        });

        it("moves cursor to tuple when moving to higher level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            await cursor.nextTuple(lowTuple, 0);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(0);
            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );

            await cursor.nextTuple(
              ithElement(tree.root.entries, 1),
              cursor.rootLevel(),
            );

            expect(cursor.index()).to.equal(1);
            expect(cursor.level()).to.equal(cursor.rootLevel());
            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(firstElement(state)),
            );
          }
        });

        it("moves cursor to tuple when moving to a lower level", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            await cursor.nextTuple(lowTuple, 0);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(0);
            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );
          }
        });

        it("does not move cursor if tuple is lower than or equal to current nodes and moving sideways or up", async () => {
          for (const tree of trees) {
            if (tree.root.level === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            await cursor.nextTuple(lowTuple, 0);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(0);
            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );

            await cursor.nextTuple(lowTuple, 0);

            expect(cursor.index()).to.equal(0);
            expect(cursor.level()).to.equal(0);
            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(lastElement(state)),
            );
          }
        });
      });

      describe("jumpTo", () => {
        it("jumps to the domain of the tuple at the requested level", async () => {
          for (const tree of trees) {
            if (tree.root.entries.length === 0) {
              continue;
            }
            const { state } = treesToStates.get(tree)!;

            const cursor = createCursor(blockstore, tree);

            expect(cursor.done()).to.equal(false);

            await cursor.jumpTo({ seq: Infinity, key: new Uint8Array() }, 0);

            expect(cursor.level()).to.equal(0);
            expect(cursor.index()).to.equal(
              cursor.currentBucket().entries.length - 1,
            );
            expect(cursor.currentBucket()).to.deep.equal(
              lastElement(lastElement(state)),
            );
            expect(cursor.done()).to.equal(false);

            await cursor.jumpTo(
              { seq: 0, key: new Uint8Array() },
              cursor.rootLevel(),
            );

            expect(cursor.level()).to.equal(cursor.rootLevel());
            expect(cursor.index()).to.equal(0);
            expect(cursor.currentBucket()).to.deep.equal(
              firstElement(firstElement(state)),
            );
            expect(cursor.done()).to.equal(false);
          }
        });

        it("rejects if jumping to level higher than root", async () => {
          for (const tree of trees) {
            if (tree.root.entries.length === 0) {
              continue;
            }

            const cursor = createCursor(blockstore, tree);

            expect(
              cursor.jumpTo(
                { seq: 0, key: new Uint8Array() },
                cursor.rootLevel() + 1,
              ),
            ).rejects.toThrow("Cannot jump to level higher than root.");
          }
        });
      });
    });
  });
});
