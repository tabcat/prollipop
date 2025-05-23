import { describe, expect, it } from "vitest";
import {
  createSharedAwaitIterable,
  ensureSortedTuplesIterable,
  findIndexFast,
  findUpperBound,
} from "../src/common.js";
import { createEntry, tuple } from "./helpers/constants.js";

describe("common", () => {
  describe("findIndexFast", () => {
    const compareNums = (a: number, b: number) => a - b;
    const array = [1, 2, 3];

    it("returns -1 if the target is not found", () => {
      expect(findIndexFast(array, 4, compareNums)).to.equal(-1);
    });

    it("returns the index of the target", () => {
      expect(findIndexFast(array, 2, compareNums)).to.equal(1);
    });
  });

  describe("findUpperBound", () => {
    const compareNums = (a: number, b: number) => a - b;
    const array = [1, 2, 3];

    it("returns 0 if boundary is lower than first element", () => {
      expect(findUpperBound(array, 0, compareNums)).to.equal(0);
    });

    it("returns array length if boundary is higher than first element", () => {
      expect(findUpperBound(array, 4, compareNums)).to.equal(array.length);
    });

    it("returns upper bound of target", () => {
      expect(findUpperBound(array, 2, compareNums)).to.equal(2);
    });
  });

  describe("createSharedAwaitIterable", () => {
    it("returns a reusable await iterable (sync)", async () => {
      const iterable = createSharedAwaitIterable([1, 2, 3]);

      for await (const n of iterable) {
        expect(n).to.equal(1);
        break;
      }

      for await (const n of iterable) {
        expect(n).to.equal(2);
        break;
      }

      for await (const n of iterable) {
        expect(n).to.equal(3);
        break;
      }
    });

    it("returns a reusable await iterable (async)", async () => {
      const iterable = createSharedAwaitIterable(
        (async function* (): AsyncIterable<number> {
          yield 1;
          yield 2;
          yield 3;
        })(),
      );

      for await (const n of iterable) {
        expect(n).to.equal(1);
        break;
      }

      for await (const n of iterable) {
        expect(n).to.equal(2);
        break;
      }

      for await (const n of iterable) {
        expect(n).to.equal(3);
        break;
      }
    });
  });

  describe("ensureSortedTuplesIterable", () => {
    it("yields tuples and entries", async () => {
      const it = ensureSortedTuplesIterable([[tuple], [createEntry(1)]]);

      expect(await it.next()).to.deep.equal({ value: [tuple], done: false });
      expect(await it.next()).to.deep.equal({
        value: [createEntry(1)],
        done: false,
      });
    });

    it("throws if tuples are not sorted or duplicate", async () => {
      const it1 = ensureSortedTuplesIterable([[tuple, tuple]]);

      expect(it1.next()).to.rejects.toThrow();

      const it2 = ensureSortedTuplesIterable([[tuple], [tuple]]);

      await it2.next();

      expect(it2.next()).to.rejects.toThrow();
    });
  });
});
