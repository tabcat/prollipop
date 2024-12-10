import { sha256 } from "@noble/hashes/sha256";
import { describe, expect, it } from "vitest";
import {
  EncodedEntry,
  decodeBucket,
  decodeEntries,
  encodeBucket,
  encodeEntries,
  isValidEncodedBucket,
  isValidEncodedEntry,
  isValidEntry,
  validateEntryRelation,
} from "../src/codec.js";
import { minTuple } from "../src/constants.js";
import { DefaultBucket } from "../src/impls.js";
import { Entry } from "../src/interface.js";
import {
  average,
  bucket,
  bytes,
  createEncodedEntry,
  createEntry,
  emptyBucket,
  encodedBucket,
  encodedBucketBytes,
  encodedEmptyBucketBytes,
  encodedEntries,
  encodedEntry,
  entries,
  entry,
  level,
  seq,
  tuple,
} from "./helpers/constants.js";

describe("codec", () => {
  describe("isValidEntry", () => {
    it("returns true for a valid entry", () => {
      expect(isValidEntry(entry)).toBe(true);
    });

    it("returns false for invalid entry", () => {
      expect(isValidEntry(null)).toBe(false);
      expect(isValidEntry({})).toBe(false);
      expect(isValidEntry(tuple)).toBe(false);
      expect(isValidEntry({ ...entry, oneMore: "field" })).toBe(false);
    });
  });

  describe("isValidEncodedEntry", () => {
    it("returns true for a valid encoded entry", () => {
      expect(isValidEncodedEntry([0, bytes, bytes])).toBe(true);
    });

    it("returns false for invalid encoded entry", () => {
      expect(isValidEncodedEntry(null)).toBe(false);
      expect(isValidEncodedEntry([])).toBe(false);
      expect(isValidEncodedEntry([0, bytes, bytes, bytes])).toBe(false);
    });
  });

  describe("isValidEncodedBucket", () => {
    it("returns true for a valid encoded bucket", () => {
      expect(isValidEncodedBucket(encodedBucket)).toBe(true);
    });

    it("returns false for invalid encoded bucket", () => {
      expect(isValidEncodedBucket(null)).toBe(false);
      expect(isValidEncodedBucket({})).toBe(false);
      expect(isValidEncodedBucket({ ...encodedBucket, oneMore: "field" })).toBe(
        false,
      );
      expect(isValidEncodedBucket({ ...encodedBucket, average: 1 })).toBe(
        false,
      );
    });
  });

  describe("validateEntryRelation", () => {
    describe("last entry", () => {
      it("returns when isBoundary on last entry", () => {
        expect(() =>
          validateEntryRelation(entry, undefined, false, () => true),
        ).not.toThrow();
      });

      it("returns when isHead on last entry", () => {
        expect(() =>
          validateEntryRelation(entry, undefined, true, () => false),
        ).not.toThrow();
      });

      it("throws when !isHead && !isBoundary(entry) on last entry", () => {
        expect(() =>
          validateEntryRelation(entry, undefined, false, () => false),
        ).toThrow("Last entry must be a boundary unless inside a head bucket.");
      });

      it("throws when range[1] !== entry on last entry", () => {
        expect(() =>
          validateEntryRelation(entry, undefined, false, () => true, [
            minTuple,
            minTuple,
          ]),
        ).toThrow("Last entry must equal max tuple range.");
      });
    });

    describe("non-last entry", () => {
      it("returns when compareEntries(entry, next) < 0 and !isBoundary", () => {
        expect(() =>
          validateEntryRelation(entry, createEntry(1), false, () => false),
        ).not.toThrow();
      });

      it("throws when compareEntries(entry, next) >= 0", () => {
        expect(() =>
          validateEntryRelation(entry, entry, false, () => false),
        ).toThrow("Entries must be sorted and non-duplicative.");
      });

      it("throws when isBoundary on non-last entry", () => {
        expect(() =>
          validateEntryRelation(entry, createEntry(1), false, () => true),
        ).toThrow("Only the last entry of a bucket can be a boundary.");
      });
    });
  });

  describe("encodeEntries", () => {
    it("returns encoded entries for a non-head bucket", () => {
      const [encodedEntries, base] = encodeEntries(entries, false, () => true, [
        minTuple,
        tuple,
      ]);
      expect(encodedEntries).toEqual([createEncodedEntry(seq)]);
      expect(base).toEqual(0);
    });

    it("returns encoded entries for a head bucket", () => {
      const [encodedEntries, base] = encodeEntries(entries, true, () => false, [
        minTuple,
        tuple,
      ]);
      expect(encodedEntries).toEqual([createEncodedEntry(seq)]);
      expect(base).toEqual(0);
    });

    it("returns delta encoded entry seqs", () => {
      const [encodedEntries, base] = encodeEntries(
        [createEntry(1), createEntry(3)],
        true,
        () => false,
        [minTuple, createEntry(3)],
      );
      expect(encodedEntries).toEqual([createEncodedEntry(2), encodedEntry]);
      expect(base).toEqual(3);
    });

    it("throws when first range[0] >= entries[0]", () => {
      expect(() =>
        encodeEntries(entries, false, () => false, [entry, entry]),
      ).toThrow("First entry must be greater than min tuple range.");
    });

    it("throws when entries[i] is invalid", () => {
      expect(() =>
        encodeEntries([null as unknown as Entry], false, () => false),
      ).toThrow("invalid entry.");
    });

    it("throws when entries are not sorted or duplicative", () => {
      expect(() => encodeEntries([entry, entry], true, () => false)).toThrow(
        "Entries must be sorted and non-duplicative.",
      );
    });
  });

  describe("decodeEntries", () => {
    it("returns decoded entries for a non-head bucket", () => {
      const decodedEntries = decodeEntries(
        encodedEntries,
        0,
        false,
        () => true,
        [minTuple, tuple],
      );
      expect(decodedEntries).toEqual(entries);
    });

    it("returns decoded entries for a head bucket", () => {
      const decodedEntries = decodeEntries(
        encodedEntries,
        0,
        true,
        () => false,
        [minTuple, tuple],
      );
      expect(decodedEntries).toEqual(entries);
    });

    it("returns delta decoded entry seqs", () => {
      const decodedEntries = decodeEntries(
        [createEncodedEntry(2), encodedEntry],
        3,
        true,
        () => false,
        [minTuple, createEntry(3)],
      );
      expect(decodedEntries).toEqual([createEntry(1), createEntry(3)]);
    });

    it("throws when first range[0] >= entries[0]", () => {
      expect(() =>
        decodeEntries([encodedEntry], 0, true, () => false, [entry, entry]),
      ).toThrow("Entry must be greater than min tuple range.");
    });

    it("throws when entries[i] is invalid", () => {
      expect(() =>
        decodeEntries([null as unknown as EncodedEntry], 0, true, () => false),
      ).toThrow("invalid encoded entry.");
    });

    it("throws when entries are not sorted or duplicative", () => {
      expect(() =>
        decodeEntries([encodedEntry, encodedEntry], 0, true, () => false, [
          entry,
          entry,
        ]),
      ).toThrow("Entries must be sorted and non-duplicative.");
    });
  });

  describe("encodeBucket", () => {
    it("returns encoded bucket for a bucket", () => {
      const encodedBucket = encodeBucket(1, level, entries, {
        isHead: false,
        isRoot: false,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("returns encoded bucket for a head bucket", () => {
      const encodedBucket = encodeBucket(average, level, entries, {
        isHead: true,
        isRoot: false,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("returns encoded bucket for a root bucket", () => {
      const encodedBucket = encodeBucket(average, level, entries, {
        isRoot: true,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("returns encoded empty root bucket", () => {
      const encodedBucket = encodeBucket(average, level, [], {
        isRoot: true,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("throws when non-root bucket has less than two entries", () => {
      expect(() =>
        encodeBucket(average, level, [entry], { isRoot: false }),
      ).toThrow("non-root bucket must have at least two entries.");
    });
  });

  describe("decodeBucket", () => {
    it("returns decoded bucket for a bucket", () => {
      const encodedBucket = encodeBucket(1, level, entries);
      const decodedBucket = decodeBucket(encodedBucket, {
        isHead: false,
        isRoot: false,
        range: [minTuple, tuple],
        expectedPrefix: {
          average: 1,
          level,
          base: 0,
        },
      });
      expect(decodedBucket).toEqual(
        new DefaultBucket(
          1,
          level,
          entries,
          encodedBucket,
          sha256(encodedBucket),
        ),
      );
    });

    it("returns decoded bucket for a head bucket", () => {
      const decodedBucket = decodeBucket(encodedBucketBytes, {
        isHead: true,
        isRoot: false,
      });
      expect(decodedBucket).toEqual(bucket);
    });

    it("returns decoded empty root bucket", () => {
      const decodedBucket = decodeBucket(encodedEmptyBucketBytes, {
        isRoot: true,
      });
      expect(decodedBucket).toEqual(emptyBucket);
    });

    it("throws when bucket is invalid", () => {
      expect(() => decodeBucket(new Uint8Array(1))).toThrow("invalid bucket.");
    });

    it("throws when non-root bucket has less than two entries", () => {
      expect(() =>
        decodeBucket(encodedEmptyBucketBytes, { isRoot: false }),
      ).toThrow("non-root bucket must have at least two entries.");
    });

    it("throws when prefix mismatch", () => {
      expect(() =>
        decodeBucket(encodedBucketBytes, {
          expectedPrefix: { average: 1, level, base: 0 },
        }),
      ).toThrow("prefix mismatch.");
    });
  });
});
