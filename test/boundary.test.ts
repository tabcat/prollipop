import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { describe, expect, it } from "vitest";
import { createIsBoundary } from "../src/boundary.js";

const MAX_UINT32 = 1n << 32n;
const average = 2;
const level = 0;
const limit = Number(MAX_UINT32) / average;
const empty = new Uint8Array(4);
const filled = new Uint8Array(4).fill(255);

describe("boundary", () => {
  describe("createIsBoundary", () => {
    it("throws if average is less than 1", () => {
      expect(() => createIsBoundary(0.0001, 0))
        .to.throw()
        .to.satisfy((e: TypeError) => e instanceof TypeError);
    });

    it("throws if average is greater than max uint32", () => {
      expect(() => createIsBoundary(Number(MAX_UINT32 + 1n), 0))
        .to.throw()
        .to.satisfy((e: TypeError) => e instanceof TypeError);
    });

    it("throws if average is not a whole number", () => {
      expect(() => createIsBoundary(3.14, 0))
        .to.throw()
        .to.satisfy((e: TypeError) => e instanceof TypeError);
    });

    describe("isBoundary", () => {
      const isBoundary = createIsBoundary(average, 0);

      it("returns false when the node is not a boundary", () => {
        const digest = sha256(encode([level, 1, empty]));
        const passed =
          new DataView(digest.buffer, digest.byteOffset).getUint32(0) < limit;

        expect(
          isBoundary({ seq: 1, key: empty, val: new Uint8Array() }),
        ).to.equal(passed);
        expect(passed).to.equal(false);
      });

      it("returns true when the node is a boundary", () => {
        const digest = sha256(encode([level, 1, filled]));
        const passed =
          new DataView(digest.buffer, digest.byteOffset).getUint32(0) < limit;

        expect(
          isBoundary({ seq: 1, key: filled, val: new Uint8Array() }),
        ).to.equal(passed);
        expect(passed).to.equal(true);
      });
    });
  });
});
