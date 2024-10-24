import { encode } from "@ipld/dag-cbor";
import { describe, expect, it } from "vitest";
import { decodeBucket, encodeBucket } from "../src/codec.js";
import { emptyBucket, encodedEmptyBucket } from "./helpers/constants.js";

const { average, level, entries } = emptyBucket;

describe("codec", () => {
  describe("encodeBucket", () => {
    it("encodes a bucket", () => {
      expect(encodeBucket(average, level, entries)).to.deep.equal(
        encodedEmptyBucket,
      );
    });
  });

  describe("decodeBucket", () => {
    it("decodes a bucket", () => {
      expect(
        decodeBucket(encodedEmptyBucket, { average, level }),
      ).to.deep.equal(emptyBucket);
    });

    it("throws when expected average does not match", () => {
      expect(() =>
        decodeBucket(encodedEmptyBucket, { average: -1, level }),
      ).toThrow();
    });

    it("throws when expected level does not match", () => {
      expect(() =>
        decodeBucket(encodedEmptyBucket, { average, level: -1 }),
      ).toThrow();
    });

    it("throws when decoded bucket is not an object", () => {
      expect(() => decodeBucket(encode(null), { average, level })).toThrow(
        "Expected bucket to be an object.",
      );
    });

    it("throws when decoded average is not a number", () => {
      expect(() => decodeBucket(encode({}), { average, level })).toThrow(
        "Expected prefix average field to be a number.",
      );
    });

    it("throws when decoded level is not a number", () => {
      expect(() =>
        decodeBucket(encode({ average }), { average, level }),
      ).toThrow("Expected prefix level field to be a number.");
    });

    it("throws when decoded entries is not an array", () => {
      expect(() =>
        decodeBucket(encode({ average, level }), { average, level }),
      ).toThrow("Expected bucket entries field to be a number.");
    });

    it("throws when decoded entries contains an invalid seq", () => {
      expect(() =>
        decodeBucket(
          encode({ average, level, entries: [[null, null, null]] }),
          {
            average,
            level,
          },
        ),
      ).toThrow("Expected entry seq field to be a number.");
    });

    it("throws when decoded entries contains an invalid hash", () => {
      expect(() =>
        decodeBucket(encode({ average, level, entries: [[0, null, null]] }), {
          average,
          level,
        }),
      ).toThrow("Expected entry key field to be a byte array.");
    });

    it("throws when decoded entries contains an invalid val", () => {
      expect(() =>
        decodeBucket(
          encode({ average, level, entries: [[0, new Uint8Array(), null]] }),
          { average, level },
        ),
      ).toThrow("Expected entry val field to be a byte array.");
    });
  });
});
