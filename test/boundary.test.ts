import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { describe, expect, it } from "vitest";
import { createIsBoundary } from "../src/boundary.js";
import { MAX_UINT32 } from "../src/constants.js";

const average = 2;
const level = 0;
const limit = MAX_UINT32 / BigInt(average);
const empty = new Uint8Array(4);

describe("boundary", () => {
  describe("createIsBoundary", () => {
    it("returns a function", () => {
      expect(createIsBoundary(average, level)).toBeInstanceOf(Function);
    });

    describe("isBoundary", () => {
      const isBoundary = createIsBoundary(average, 0);

      it("returns false when the entry is not a boundary", () => {
        const digest = sha256(encode([level, 1, empty]));
        const passed =
          new DataView(digest.buffer, digest.byteOffset).getUint32(0) < limit;

        expect(
          isBoundary({ seq: 1, key: empty, val: new Uint8Array() }),
        ).to.equal(passed);
        expect(passed).to.equal(false);
      });

      it("returns true when the entry is a boundary", () => {
        const digest = sha256(encode([level, 2, empty]));
        const passed =
          new DataView(digest.buffer, digest.byteOffset).getUint32(0) < limit;

        expect(
          isBoundary({ seq: 2, key: empty, val: new Uint8Array() }),
        ).to.equal(passed);
        expect(passed).to.equal(true);
      });
    });
  });
});
