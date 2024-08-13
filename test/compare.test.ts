import { describe, expect, it } from "vitest";
import {
  compareNodes,
  compareTimestamp,
  compareTuples,
} from "../src/compare.js";

describe("compare", () => {
  describe("compareTimestamp", () => {
    it("returns the difference of two numbers", () => {
      expect(compareTimestamp(1, 1)).to.equal(1 - 1);
      expect(compareTimestamp(1, 0)).to.equal(1 - 0);
      expect(compareTimestamp(0, 1)).to.equal(0 - 1);
    });
  });

  describe("compareTuples", () => {
    it("returns the difference of the timestamp if they do not match", () => {
      expect(
        compareTuples(
          { timestamp: 1, hash: new Uint8Array() },
          { timestamp: 2, hash: new Uint8Array() },
        ),
      ).to.equal(-1);
      expect(
        compareTuples(
          { timestamp: 2, hash: new Uint8Array() },
          { timestamp: 1, hash: new Uint8Array() },
        ),
      ).to.equal(1);
    });

    it("returns the order of the hashes if they do not match", () => {
      expect(
        compareTuples(
          { timestamp: 1, hash: new Uint8Array([1]) },
          { timestamp: 1, hash: new Uint8Array([2]) },
        ),
      ).to.equal(-1);
      expect(
        compareTuples(
          { timestamp: 1, hash: new Uint8Array([2]) },
          { timestamp: 1, hash: new Uint8Array([1]) },
        ),
      ).to.equal(1);
    });

    it("returns 0 if the tuples are identical", () => {
      expect(
        compareTuples(
          { timestamp: 1, hash: new Uint8Array([1]) },
          { timestamp: 1, hash: new Uint8Array([1]) },
        ),
      ).to.equal(0);
      expect(
        compareTuples(
          { timestamp: 2, hash: new Uint8Array([2]) },
          { timestamp: 2, hash: new Uint8Array([2]) },
        ),
      ).to.equal(0);
    });
  });

  describe("compareNodes", () => {
    it("returns the difference of the timestamp if they do not match", () => {
      expect(
        compareNodes(
          { timestamp: 1, hash: new Uint8Array(), message: new Uint8Array() },
          { timestamp: 2, hash: new Uint8Array(), message: new Uint8Array() },
        ),
      ).to.equal(-1);
      expect(
        compareNodes(
          { timestamp: 2, hash: new Uint8Array(), message: new Uint8Array() },
          { timestamp: 1, hash: new Uint8Array(), message: new Uint8Array() },
        ),
      ).to.equal(1);
    });

    it("returns the order of the hashes if they do not match", () => {
      expect(
        compareNodes(
          {
            timestamp: 1,
            hash: new Uint8Array([1]),
            message: new Uint8Array(1),
          },
          {
            timestamp: 1,
            hash: new Uint8Array([2]),
            message: new Uint8Array(),
          },
        ),
      ).to.equal(-1);
      expect(
        compareNodes(
          {
            timestamp: 1,
            hash: new Uint8Array([2]),
            message: new Uint8Array(2),
          },
          {
            timestamp: 1,
            hash: new Uint8Array([1]),
            message: new Uint8Array(),
          },
        ),
      ).to.equal(1);
    });

    it("returns the order of the messages if the tuples are identical", () => {
      expect(
        compareNodes(
          {
            timestamp: 1,
            hash: new Uint8Array([1]),
            message: new Uint8Array(1),
          },
          {
            timestamp: 1,
            hash: new Uint8Array([1]),
            message: new Uint8Array(2),
          },
        ),
      ).to.equal(-1);
      expect(
        compareNodes(
          {
            timestamp: 2,
            hash: new Uint8Array([2]),
            message: new Uint8Array(2),
          },
          {
            timestamp: 2,
            hash: new Uint8Array([2]),
            message: new Uint8Array(1),
          },
        ),
      ).to.equal(1);
    });

    it("returns 0 if the messsage are identical", () => {
      expect(
        compareNodes(
          {
            timestamp: 1,
            hash: new Uint8Array([1]),
            message: new Uint8Array(1),
          },
          {
            timestamp: 1,
            hash: new Uint8Array([1]),
            message: new Uint8Array(1),
          },
        ),
      ).to.equal(0);
      expect(
        compareNodes(
          {
            timestamp: 2,
            hash: new Uint8Array([2]),
            message: new Uint8Array(2),
          },
          {
            timestamp: 2,
            hash: new Uint8Array([2]),
            message: new Uint8Array(2),
          },
        ),
      ).to.equal(0);
    });
  });
});
