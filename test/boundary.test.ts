import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import { createIsBoundary } from "../src/boundary.js";
import { MAX_UINT32 } from "../src/constants.js";
import { createEntry, numberToBytes } from "./helpers/utils.js";

const average = 2;
const level = 0;
const limit = MAX_UINT32 / average;

describe("boundary", () => {
  describe("createIsBoundary", () => {
    it("returns a function", () => {
      expect(createIsBoundary(average, level)).toBeInstanceOf(Function);
    });

    describe("isBoundary", () => {
      const isBoundary = createIsBoundary(average, 0);

      it("returns false when the entry is not a boundary", () => {
        const digest = sha256(new Uint8Array([level, ...numberToBytes(0)]));
        const passed =
          new DataView(digest.buffer, digest.byteOffset).getUint32(0) < limit;

        expect(isBoundary(createEntry(0))).to.equal(passed);
        expect(passed).to.equal(false);
      });

      it("returns true when the entry is a boundary", () => {
        const digest = sha256(new Uint8Array([level, ...numberToBytes(1)]));
        const passed =
          new DataView(digest.buffer, digest.byteOffset).getUint32(0) < limit;

        expect(isBoundary(createEntry(1))).to.equal(passed);
        expect(passed).to.equal(true);
      });
    });
  });
});
