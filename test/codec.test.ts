import { encode } from "@ipld/dag-cbor";
import { describe, expect, it } from "vitest";
import { decodeBucket, encodeBucket } from "../src/codec.js";
import { base, emptyBucket, encodedEmptyBucket } from "./helpers/constants.js";

const { average, level, entries } = emptyBucket;

describe("codec", () => {
  describe("encodeBucket", () => {
    it("encodes a bucket", () => {
      expect(encodeBucket(average, level, entries)).to.deep.equal(
        encodedEmptyBucket,
      );
    });

    it("delta encodes the seq fields of entries", () => {});
  });

  describe("decodeBucket", () => {
    it("decodes a bucket", () => {
      expect(
        decodeBucket(encodedEmptyBucket, { average, level, base }),
      ).to.deep.equal(emptyBucket);
    });

    it("delta decodes the seq fields entries", () => {});

    it("throws when expected average does not match", () => {
      expect(() =>
        decodeBucket(encodedEmptyBucket, { average: -1, level, base }),
      ).toThrow();
    });

    it("throws when expected level does not match", () => {
      expect(() =>
        decodeBucket(encodedEmptyBucket, { average, level: -1, base }),
      ).toThrow();
    });

    it("throws when decoded bucket is not an object", () => {
      expect(() =>
        decodeBucket(encode(null), { average, level, base }),
      ).toThrow("Expected bucket to be an object.");
    });

    it("throws when decoded average is not a number", () => {
      expect(() => decodeBucket(encode({}), { average, level, base })).toThrow(
        "Expected prefix average field to be a number.",
      );
    });

    it("throws when decoded level is not a number", () => {
      expect(() =>
        decodeBucket(encode({ average }), { average, level, base }),
      ).toThrow("Expected prefix level field to be a number.");
    });

    it("throws when decoded base is not a number", () => {
      expect(() =>
        decodeBucket(encode({ average, level }), { average, level, base }),
      ).toThrow("Expected prefix base field to be a number.");
    });

    it("throws when decoded entries is not an array", () => {
      expect(() =>
        decodeBucket(encode({ average, level, base }), {
          average,
          level,
          base,
        }),
      ).toThrow("Expected bucket entries field to be a number.");
    });

    it("throws when decoded entries contains an invalid seq", () => {
      expect(() =>
        decodeBucket(
          encode({ average, level, base, entries: [[null, null, null]] }),
          {
            average,
            level,
            base,
          },
        ),
      ).toThrow("Expected entry seq field to be a number.");
    });

    it("throws when decoded entries contains an invalid hash", () => {
      expect(() =>
        decodeBucket(
          encode({ average, level, base, entries: [[0, null, null]] }),
          {
            average,
            level,
            base,
          },
        ),
      ).toThrow("Expected entry key field to be a byte array.");
    });

    it("throws when decoded entries contains an invalid val", () => {
      expect(() =>
        decodeBucket(
          encode({
            average,
            level,
            base,
            entries: [[0, new Uint8Array(), null]],
          }),
          { average, level, base },
        ),
      ).toThrow("Expected entry val field to be a byte array.");
    });
  });
});
