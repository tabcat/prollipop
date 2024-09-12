import { encode } from "@ipld/dag-cbor";
import { describe, expect, it } from "vitest";
import { decodeBucket, encodeBucket } from "../src/codec.js";
import { emptyBucket, encodedEmptyBucket } from "./helpers/constants.js";

const { average, level, nodes } = emptyBucket;

describe("codec", () => {
  describe("encodeBucket", () => {
    it("encodes a bucket", () => {
      expect(encodeBucket(average, level, nodes)).to.deep.equal(
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

    it("throws when decoded nodes is not an array", () => {
      expect(() =>
        decodeBucket(encode({ average, level }), { average, level }),
      ).toThrow("Expected bucket nodes field to be a number.");
    });

    it("throws when decoded nodes contains an invalid timestamp", () => {
      expect(() =>
        decodeBucket(encode({ average, level, nodes: [[null, null, null]] }), {
          average,
          level,
        }),
      ).toThrow("Expected node timestamp field to be a number.");
    });

    it("throws when decoded nodes contains an invalid hash", () => {
      expect(() =>
        decodeBucket(encode({ average, level, nodes: [[0, null, null]] }), {
          average,
          level,
        }),
      ).toThrow("Expected node hash field to be a byte array.");
    });

    it("throws when decoded nodes contains an invalid message", () => {
      expect(() =>
        decodeBucket(
          encode({ average, level, nodes: [[0, new Uint8Array(), null]] }),
          { average, level },
        ),
      ).toThrow("Expected node message field to be a byte array.");
    });
  });
});
