import { describe, expect, it } from "vitest";
import { Cursor } from "../src/cursor.js";
import { Entry } from "../src/interface.js";
import {
  Update,
  Updts,
  applyUpdate,
  collectUpdates,
  exclusiveMax,
  getBucket,
  getCurrentUpdateTuple,
  getUpdatee,
  handleArray,
  rebuildBucket,
} from "../src/mutate.js";
import { createBucket, entryToTuple } from "../src/utils.js";
import {
  average,
  bucket,
  createEntry,
  entry,
  tuple,
} from "./helpers/constants.js";

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

  describe("handleArray", () => {
    const array = ["a"];

    it("turns a non-array into an array", () => {
      expect(handleArray(array[0])).to.deep.equal(array);
    });

    it("returns the same array", () => {
      expect(handleArray(array)).to.equal(array);
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

  describe("getCurrentUpdateTuple", () => {
    describe("on level 0", () => {
      const level = 0;

      it("returns the current tuple from updts.current if non-empty", async () => {
        const user: Update[] = [{ seq: 1, key: new Uint8Array() }];
        const updts: Updts = {
          current: [tuple],
          user: user[Symbol.iterator](),
          next: [],
        };

        expect(updts.current.length).to.equal(1);

        const currentTuple = await getCurrentUpdateTuple(updts, level);

        expect(currentTuple).to.equal(tuple);
        expect(updts.current.length).to.equal(1);
      });

      it("adds the first tuple from updts.user to updts.current and returns the current tuple", async () => {
        const user = [tuple];
        const updts: Updts = {
          current: [],
          user: user[Symbol.iterator](),
          next: [],
        };

        expect(updts.current.length).to.equal(0);

        const currentTuple = await getCurrentUpdateTuple(updts, level);

        expect(currentTuple).to.equal(tuple);
        expect(updts.current.length).to.equal(1);
      });

      it("returns null if updts.current and updts.user are empty", async () => {
        const updts: Updts = {
          current: [],
          user: [],
          next: [tuple],
        };

        const currentTuple = await getCurrentUpdateTuple(updts, level);

        expect(currentTuple).to.equal(null);
      });
    });

    describe("above level 0", () => {
      const level = 1;

      it("returns the current tuple from updts.current if non-empty", async () => {
        const user: Update[] = [{ seq: 1, key: new Uint8Array() }];
        const updts: Updts = {
          current: [tuple],
          user: user[Symbol.iterator](),
          next: [],
        };

        expect(updts.current.length).to.equal(1);

        const currentTuple = await getCurrentUpdateTuple(updts, level);

        expect(currentTuple).to.equal(tuple);
        expect(updts.current.length).to.equal(1);
      });

      it("returns null if updts.current is empty", async () => {
        const updts: Updts = {
          current: [],
          user: [tuple],
          next: [tuple],
        };

        const currentTuple = await getCurrentUpdateTuple(updts, level);

        expect(currentTuple).to.equal(null);
      });
    });
  });

  describe("getUpdatee", () => {
    it("returns next bucket if leftovers is not empty", async () => {
      const cursor = {
        nextBucket: () => {},
        currentBucket: () => bucket,
        isAtHead: () => false,
      } as unknown as Cursor;

      const [updatee, isTail, isHead] = await getUpdatee(
        cursor,
        [entry],
        null,
        0,
      );

      expect(updatee).to.equal(bucket);
      expect(isTail).to.equal(false);
      expect(isHead).to.equal(false);
    });

    it("returns null if leftovers is empty and tuple is null ", async () => {
      const cursor = {} as unknown as Cursor;

      const [updatee, isTail, isHead] = await getUpdatee(cursor, [], null, 0);

      expect(updatee).to.equal(null);
      expect(isTail).to.equal(false);
      expect(isHead).to.equal(false);
    });

    it("returns bucket at tuple on level if leftovers is empty", async () => {
      const cursor: Cursor = {
        jumpTo: () => {},
        isAtHead: () => false,
        isAtTail: () => false,
        currentBucket: () => bucket,
        rootLevel: () => 0,
      } as unknown as Cursor;

      const [updatee, isTail, isHead] = await getUpdatee(cursor, [], tuple, 0);

      expect(updatee).to.equal(bucket);
      expect(isTail).to.equal(false);
      expect(isHead).to.equal(false);
    });

    it("returns empty bucket on level if leftovers is empty and level > root level", async () => {
      const cursor = {
        currentBucket: () => bucket,
        rootLevel: () => 0,
      } as unknown as Cursor;

      const [updatee, isTail, isHead] = await getUpdatee(cursor, [], tuple, 1);

      expect(updatee).to.not.equal(bucket);
      expect(updatee!.average).to.equal(bucket.average);
      expect(updatee!.level).to.equal(1);
      expect(updatee!.entries.length).to.equal(0);
      expect(isTail).to.equal(true);
      expect(isHead).to.equal(true);
    });
  });

  describe("collectUpdates", () => {
    const entries = [0, 1, 2, 3].map(createEntry);

    it("does not collect updates if last of updts.current = boundary", async () => {
      const boundary = entries[0]!;
      const updts: Updts = {
        current: entries.slice(0, 1),
        user: entries.slice(1)[Symbol.iterator](),
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(entries.slice(0, 1));
    });

    it("does not collect updates if last of updts.current > boundary", async () => {
      const boundary = entries[0]!;
      const updts: Updts = {
        current: entries.slice(0, 2),
        user: entries.slice(2)[Symbol.iterator](),
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(entries.slice(0, 2));
    });

    it("collects updates until last of updts.current = boundary", async () => {
      const boundary = entries[1]!;
      const updts: Updts = {
        current: entries.slice(0, 1),
        user: entries.slice(1)[Symbol.iterator](),
        next: [],
      };

      await collectUpdates(boundary, updts, false);

      expect(updts.current).to.deep.equal(entries.slice(0, 2));
    });

    it("collects updates until last of updts.current > boundary", async () => {
      const boundary = entries[1]!;
      const updts: Updts = {
        current: entries.slice(0, 1),
        user: entries.slice(2)[Symbol.iterator](),
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
        user: entries.slice(1)[Symbol.iterator](),
        next: [],
      };

      await collectUpdates(boundary, updts, true);

      expect(updts.current).to.deep.equal(entries);
    });
  });

  describe("getBucket", () => {
    it("returns the original bucket if digests match", () => {
      expect(getBucket(bucket, bucket.entries)).to.equal(bucket);
    });

    it("returns a new bucket if digests differ", () => {
      expect(getBucket(bucket, [])).to.not.equal(bucket);
    });
  });

  describe("rebuildBucket", () => {
    it("throws if non-head bucket doesn't end in boundary", () => {
      const bucket = createBucket(average, 0, [createEntry(1)]);
      expect(() =>
        rebuildBucket(bucket, [], [], false, 0, () => false),
      ).toThrowError("malformed tree.");
    });

    describe("basic operations", () => {
      const isBoundary = (e: Entry) => e.seq === 2;

      it("returns original bucket when no changes needed", () => {
        const bucket = createBucket(average, 0, [
          createEntry(1),
          createEntry(2),
        ]);
        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          [],
          [],
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]).to.equal(bucket); // Same reference
        expect(leftover).to.deep.equal([]);
        expect(diff).to.deep.equal([]);
      });

      it("processes leftovers correctly", () => {
        const bucket = createBucket(average, 0, [createEntry(2)]);
        const leftovers = [createEntry(1)];

        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          leftovers,
          [],
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([
          createEntry(1),
          createEntry(2),
        ]);
        expect(leftover).to.deep.equal([]);
        expect(diff).to.deep.equal([]);
      });

      it("handles head bucket without boundary", () => {
        const bucket = createBucket(average, 0, [createEntry(1)]);
        const [buckets] = rebuildBucket(bucket, [], [], true, 0, () => false);

        expect(buckets).to.have.length(1);
        expect(buckets[0]!.entries).to.deep.equal([createEntry(1)]);
      });
    });

    describe("updates", () => {
      const isBoundary = (e: Entry) => e.seq % 2 === 0;

      it("handles add updates", () => {
        const bucket = createBucket(average, 0, [createEntry(2)]);
        const updates = [createEntry(1)];

        const [buckets, _, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([
          createEntry(1),
          createEntry(2),
        ]);
        expect(diff).to.deep.equal([[null, createEntry(1)]]);
      });

      it("handles remove updates", () => {
        const entries = [createEntry(1), createEntry(2)];
        const bucket = createBucket(average, 0, entries);
        const updates = [entryToTuple(entries[0]!)];

        const [buckets, _, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([createEntry(2)]);
        expect(diff).to.deep.equal([[entries[0], null]]);
      });

      it("handles strict remove updates", () => {
        const entries = [createEntry(1), createEntry(2)];
        const bucket = createBucket(average, 0, entries);
        const updates = [{ ...entries[0]!, strict: true }];

        const [buckets, _, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          false,
          0,
          isBoundary,
        );

        expect(buckets[0]!.entries).to.deep.equal([createEntry(2)]);
        expect(diff).to.deep.equal([[entries[0], null]]);
      });
    });

    // Boundary handling tests
    describe("boundary handling", () => {
      const isBoundary = (e: Entry) => e.seq % 2 === 0;

      it("splits bucket at boundaries", () => {
        const bucket = createBucket(average, 0, [
          createEntry(1),
          createEntry(2),
          createEntry(3),
          createEntry(4),
        ]);

        const [buckets] = rebuildBucket(bucket, [], [], false, 0, isBoundary);

        expect(buckets).to.have.length(2);
        expect(buckets[0]!.entries).to.deep.equal([
          createEntry(1),
          createEntry(2),
        ]);
        expect(buckets[1]!.entries).to.deep.equal([
          createEntry(3),
          createEntry(4),
        ]);
      });
    });

    describe("edge cases", () => {
      const isBoundary = (e: Entry) => e.seq % 2 === 0;

      it("handles empty bucket", () => {
        const bucket = createBucket(average, 0, []);
        const [buckets] = rebuildBucket(bucket, [], [], true, 0, isBoundary);

        expect(buckets).to.have.length(1);
        expect(buckets[0]!.entries).to.deep.equal([]);
      });

      it("handles complete removal of entries", () => {
        const entries = [createEntry(1), createEntry(2)];
        const bucket = createBucket(average, 0, entries);
        const updates = entries.map(entryToTuple);

        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          false,
          0,
          isBoundary,
        );

        expect(buckets).to.have.length(0);
        expect(leftover).to.deep.equal([]);
        expect(diff).to.have.length(2);
      });

      it("handles complete removal with isHead=true and bucketsRebuilt=1", () => {
        const entries = [createEntry(1), createEntry(2)];
        const bucket = createBucket(average, 0, entries);
        const updates = entries.map(entryToTuple);
        const bucketsRebuilt = 1;

        const [buckets, leftover, diff] = rebuildBucket(
          bucket,
          [],
          updates,
          true,
          bucketsRebuilt,
          isBoundary,
        );

        expect(buckets).to.have.length(0);
        expect(leftover).to.deep.equal([]);
        expect(diff).to.have.length(2);
      });
    });
  });

  describe("rebuildLevel", () => {
    it("returns the same tree if updates empty", () => {});
  });

  describe("mutate", () => {
    it("returns the same tree", () => {});
    it("adds entry to emtpy tree", async () => {});
    it("removes all the entries from a single level tree", async () => {});
    it("removes all the entries from a multiple level tree", async () => {});
    it("causes a new level to be created", async () => {});
    it("causes level to be removed", async () => {});
    it("does nothing if updates are empty", async () => {});
    it("does nothing if updates do nothing", async () => {});
  });
});
