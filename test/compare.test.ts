import { describe, expect, it, vi } from "vitest";
import {
  compareBoundaries,
  compareBucketDigests,
  compareEntries,
  compareLevels,
  compareTuples,
  composeComparators,
} from "../src/compare.js";
import { Bucket, Entry } from "../src/interface.js";
import { createEntry, entry } from "./helpers/constants.js";

describe("compare", () => {
  describe("composeComparators", () => {
    type Element = [number, number];

    const mockComparator1 = vi.fn((a: Element, b: Element) => a[0] - b[0]);
    const mockComparator2 = vi.fn((a: Element, b: Element) => a[1] - b[1]);

    const comparitor = composeComparators(mockComparator1, mockComparator2);

    it("returns 0 when no comparators are provided", () => {
      expect(composeComparators()([0, 1], [1, 0])).toBe(0);
    });

    it("returns the first non-zero comparitor", () => {
      expect(comparitor([0, 0], [1, 0])).toBe(-1);
      expect(comparitor([1, 1], [1, 0])).toBe(1);
    });

    it("returns 0 when all comparators return 0", () => {
      expect(comparitor([1, 1], [1, 1])).toBe(0);
    });
  });

  describe("entries", () => {
    describe("compareTuples", () => {
      it("returns the difference of the seq if they do not match", () => {
        expect(
          compareTuples(
            { seq: 1, key: new Uint8Array() },
            { seq: 2, key: new Uint8Array() },
          ),
        ).to.equal(-1);
        expect(
          compareTuples(
            { seq: 2, key: new Uint8Array() },
            { seq: 1, key: new Uint8Array() },
          ),
        ).to.equal(1);
      });

      it("returns the order of the hashes if they do not match", () => {
        expect(
          compareTuples(
            { seq: 1, key: new Uint8Array([1]) },
            { seq: 1, key: new Uint8Array([2]) },
          ),
        ).to.equal(-1);
        expect(
          compareTuples(
            { seq: 1, key: new Uint8Array([2]) },
            { seq: 1, key: new Uint8Array([1]) },
          ),
        ).to.equal(1);
      });

      it("returns 0 if the tuples are identical", () => {
        expect(
          compareTuples(
            { seq: 1, key: new Uint8Array([1]) },
            { seq: 1, key: new Uint8Array([1]) },
          ),
        ).to.equal(0);
        expect(
          compareTuples(
            { seq: 2, key: new Uint8Array([2]) },
            { seq: 2, key: new Uint8Array([2]) },
          ),
        ).to.equal(0);
      });
    });

    describe("compareEntries", () => {
      it("returns the difference of the seq if they do not match", () => {
        expect(
          compareEntries(
            { seq: 1, key: new Uint8Array(), val: new Uint8Array() },
            { seq: 2, key: new Uint8Array(), val: new Uint8Array() },
          ),
        ).to.equal(-1);
        expect(
          compareEntries(
            { seq: 2, key: new Uint8Array(), val: new Uint8Array() },
            { seq: 1, key: new Uint8Array(), val: new Uint8Array() },
          ),
        ).to.equal(1);
      });

      it("returns the order of the key if they do not match", () => {
        expect(
          compareEntries(
            {
              seq: 1,
              key: new Uint8Array([1]),
              val: new Uint8Array(1),
            },
            {
              seq: 1,
              key: new Uint8Array([2]),
              val: new Uint8Array(),
            },
          ),
        ).to.equal(-1);
        expect(
          compareEntries(
            {
              seq: 1,
              key: new Uint8Array([2]),
              val: new Uint8Array(2),
            },
            {
              seq: 1,
              key: new Uint8Array([1]),
              val: new Uint8Array(),
            },
          ),
        ).to.equal(1);
      });

      it("returns the order of the vals if the tuples are identical", () => {
        expect(
          compareEntries(
            {
              seq: 1,
              key: new Uint8Array([1]),
              val: new Uint8Array(1),
            },
            {
              seq: 1,
              key: new Uint8Array([1]),
              val: new Uint8Array(2),
            },
          ),
        ).to.equal(-1);
        expect(
          compareEntries(
            {
              seq: 2,
              key: new Uint8Array([2]),
              val: new Uint8Array(2),
            },
            {
              seq: 2,
              key: new Uint8Array([2]),
              val: new Uint8Array(1),
            },
          ),
        ).to.equal(1);
      });

      it("returns 0 if the messsages are identical", () => {
        expect(
          compareEntries(
            {
              seq: 1,
              key: new Uint8Array([1]),
              val: new Uint8Array(1),
            },
            {
              seq: 1,
              key: new Uint8Array([1]),
              val: new Uint8Array(1),
            },
          ),
        ).to.equal(0);
        expect(
          compareEntries(
            {
              seq: 2,
              key: new Uint8Array([2]),
              val: new Uint8Array(2),
            },
            {
              seq: 2,
              key: new Uint8Array([2]),
              val: new Uint8Array(2),
            },
          ),
        ).to.equal(0);
      });
    });
  });

  describe("buckets", () => {
    describe("compareBucketDigests", () => {
      const bucket1 = {
        getAddressed: () => ({
          digest: new Uint8Array([1]),
          bytes: new Uint8Array(),
        }),
      } as Bucket;
      const bucket2 = {
        getAddressed: () => ({
          digest: new Uint8Array([2]),
          bytes: new Uint8Array(),
        }),
      } as Bucket;

      it("returns the order of the digests if they do not match", () => {
        expect(compareBucketDigests(bucket1, bucket2)).to.equal(-1);
        expect(compareBucketDigests(bucket2, bucket1)).to.equal(1);
      });

      it("returns 0 if the digests are identical", () => {
        expect(compareBucketDigests(bucket1, bucket1)).to.equal(0);
      });
    });

    describe("compareLevels", () => {
      it("returns the difference of the levels if they do not match", () => {
        expect(
          compareLevels({ level: 0 } as Bucket, { level: 1 } as Bucket),
        ).to.equal(-1);
        expect(
          compareLevels({ level: 1 } as Bucket, { level: 0 } as Bucket),
        ).to.equal(1);
        expect(
          compareLevels({ level: 0 } as Bucket, { level: 1000 } as Bucket),
        ).to.equal(-1000);
      });
    });

    describe("compareBoundaries", () => {
      const bucket1 = {
        entries: [] as Entry[],
      } as Bucket;
      const bucket2 = {
        entries: [entry],
      } as Bucket;
      const bucket3 = {
        entries: [createEntry(1)],
      } as Bucket;

      it("returns 0 if the boundaries are both null", () => {
        expect(compareBoundaries(bucket1, bucket1)).to.equal(0);
      });

      it("it returns the order of the bucket boundaries if one is null", () => {
        expect(compareBoundaries(bucket1, bucket2)).to.equal(-1);
        expect(compareBoundaries(bucket2, bucket1)).to.equal(1);
      });

      it("returns the order of the tuples if the boundaries are not null", () => {
        expect(compareBoundaries(bucket2, bucket3)).to.equal(-1);
        expect(compareBoundaries(bucket3, bucket2)).to.equal(1);
      });
    });
  });
});
