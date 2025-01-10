import { describe, expect, it } from "vitest";
import { compareEntries, compareTuples } from "../src/compare.js";

describe("compare", () => {
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

    it("returns the order of the hashes if they do not match", () => {
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

    it("returns 0 if the messsage are identical", () => {
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
