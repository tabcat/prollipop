import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { describe, expect, it } from "vitest";
import {
  EncodedEntry,
  decodeBucket,
  decodeEntries,
  encodeBucket,
  encodeEntries,
  isBucket,
  isEncodedEntry,
  isEntry,
  validateEntriesLength,
  validateEntryRelation,
} from "../src/codec.js";
import { MAX_TREE_LEVEL } from "../src/constants.js";
import { DefaultBucket } from "../src/impls.js";
import { Entry } from "../src/interface.js";
import {
  addressed,
  average,
  bucket,
  context,
  emptyAddressed,
  emptyBucket,
  encodedBucket,
  encodedEntries,
  encodedEntry,
  entries,
  entry,
  key,
  level,
  noBytes,
} from "./helpers/constants.js";
import {
  createBoundaryEntry,
  createEncodedEntry,
  createEntry,
  createKey,
} from "./helpers/utils.js";

describe("codec", () => {
  describe("isEntry", () => {
    it("returns true for a valid entry", () => {
      expect(isEntry(entry)).toBe(true);
    });

    it("returns false for invalid entry", () => {
      expect(isEntry(null)).toBe(false);
      expect(isEntry({})).toBe(false);
      expect(isEntry(key)).toBe(false);
      expect(isEntry({ ...entry, oneMore: "field" })).toBe(false);
    });
  });

  describe("isEncodedEntry", () => {
    it("returns true for a valid encoded entry", () => {
      expect(isEncodedEntry([noBytes, noBytes])).toBe(true);
    });

    it("returns false for invalid encoded entry", () => {
      expect(isEncodedEntry(null)).toBe(false);
      expect(isEncodedEntry([])).toBe(false);
      expect(isEncodedEntry([noBytes, noBytes, noBytes])).toBe(false);
    });
  });

  describe("isEncodedBucket", () => {
    it("returns true for a valid encoded bucket", () => {
      expect(isBucket(encodedBucket)).toBe(true);
    });

    it("returns false for invalid encoded bucket", () => {
      expect(isBucket(null)).toBe(false);
      expect(isBucket({})).toBe(false);
      expect(isBucket({ ...encodedBucket, oneMore: "field" })).toBe(false);
      expect(isBucket({ ...encodedBucket, average: 1 })).toBe(false);
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
            "MIN_KEY",
            "MIN_KEY",
          ]),
        ).toThrow("Last entry must equal max key range.");
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

  describe("validateEntriesLength", () => {
    it("returns when isRoot on level 0 and length is 0", () => {
      expect(() => validateEntriesLength(0, 0, true)).to.not.throw();
    });

    it("throws when !isRoot and length < 1", () => {
      expect(() => validateEntriesLength(0, 0, false)).toThrow(
        "non-root bucket must have at least one entry.",
      );
    });

    it("throws when isRoot on level > 0 and length < 2", () => {
      expect(() => validateEntriesLength(1, 1, true)).toThrow(
        "root bucket on level > 0 must have at least two entries.",
      );
    });
  });

  describe("encodeEntries", () => {
    it("returns encoded entries for a non-head bucket", () => {
      const encodedEntries = encodeEntries(entries, false, () => true);
      expect(encodedEntries).toEqual([createEncodedEntry(0)]);
    });

    it("returns encoded entries for a head bucket", () => {
      const encodedEntries = encodeEntries(entries, true, () => false);
      expect(encodedEntries).toEqual([createEncodedEntry(0)]);
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
      const decodedEntries = decodeEntries(encodedEntries, false, () => true, [
        "MIN_KEY",
        key,
      ]);
      expect(decodedEntries).toEqual(entries);
    });

    it("returns decoded entries for a head bucket", () => {
      const decodedEntries = decodeEntries(encodedEntries, true, () => false, [
        "MIN_KEY",
        key,
      ]);
      expect(decodedEntries).toEqual(entries);
    });

    it("throws when first range[0] >= entries[0]", () => {
      expect(() =>
        decodeEntries([encodedEntry], true, () => false, [
          entry.key,
          entry.key,
        ]),
      ).toThrow("Entry must be greater than min key range.");
    });

    it("throws when entries[i] is invalid", () => {
      expect(() =>
        decodeEntries([null as unknown as EncodedEntry], true, () => false),
      ).toThrow("invalid encoded entry.");
    });

    it("throws when entries are not sorted or duplicative", () => {
      expect(() =>
        decodeEntries([encodedEntry, encodedEntry], true, () => false, [
          "MIN_KEY",
          entry.key,
        ]),
      ).toThrow("Entries must be sorted and non-duplicative.");
    });
  });

  describe("encodeBucket", () => {
    it("returns encoded bucket for a bucket", () => {
      const average = 2;
      const encodedBucket = encodeBucket(
        2,
        level,
        [createBoundaryEntry(average, level, 0)[0]],
        {
          isTail: false,
          isHead: false,
        },
      );
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("returns encoded bucket for a head bucket", () => {
      const encodedBucket = encodeBucket(average, level, entries, {
        isTail: false,
        isHead: true,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("returns encoded bucket for a root bucket", () => {
      const encodedBucket = encodeBucket(average, level, entries, {
        isTail: true,
        isHead: true,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("returns encoded empty root bucket", () => {
      const encodedBucket = encodeBucket(average, level, [], {
        isTail: true,
        isHead: true,
      });
      expect(encodedBucket).toEqual(encodedBucket);
    });

    it("throws when level > MAX_LEVEL", () => {
      expect(() =>
        encodeBucket(
          average,
          MAX_TREE_LEVEL + 1,
          [createEntry(1), createEntry(2)],
          {
            isTail: true,
            isHead: true,
          },
        ),
      ).toThrow("invalid bucket.");
    });

    it("throws when non-root bucket has less than one entries", () => {
      expect(() =>
        encodeBucket(average, level, [], { isTail: false, isHead: false }),
      ).toThrow("non-root bucket must have at least one entry.");
    });

    it("throws when root bucket > level 0 has less than two entries", () => {
      expect(() =>
        encodeBucket(average, 1, [], { isTail: true, isHead: true }),
      ).toThrow("root bucket on level > 0 must have at least two entries.");
    });

    it("throws when max key range not equal to last entry", () => {
      expect(() =>
        encodeBucket(
          average,
          level,
          entries,
          { isHead: true, isTail: true },
          {
            range: ["MIN_KEY", "MAX_KEY"],
          },
        ),
      ).toThrow("Last entry must equal max key range.");
    });

    it("throws when min key range greater than some entries", () => {
      expect(() =>
        encodeBucket(
          average,
          level,
          [createEntry(0), createEntry(1)],
          { isHead: true, isTail: true },
          {
            range: [createKey(1), createKey(1)],
          },
        ),
      ).toThrow("Entry must be greater than min key range.");
    });

    it("throws when prefix mismatch", () => {
      expect(() =>
        encodeBucket(
          average,
          level,
          entries,
          { isHead: true, isTail: true },
          {
            prefix: {
              average: 55,
              level,
            },
          },
        ),
      ).toThrow("prefix mismatch.");
    });
  });

  describe("decodeBucket", () => {
    it("returns decoded bucket for a bucket", () => {
      const average = 2;
      const context = { isTail: false, isHead: false };
      const boundary = createBoundaryEntry(average, level, 0)[0];
      const addressed = encodeBucket(2, level, [boundary], context);
      const decodedBucket = decodeBucket(addressed, context, {
        prefix: {
          average: 2,
          level,
        },
        range: ["MIN_KEY", boundary.key],
      });
      expect(decodedBucket).toEqual(
        new DefaultBucket(2, level, [boundary], addressed, context),
      );
    });

    it("returns decoded bucket for a head bucket", () => {
      const context = { isTail: false, isHead: true };
      const addressed = encodeBucket(32, level, entries, context);
      const decodedBucket = decodeBucket(addressed, context);
      expect(decodedBucket).toEqual(bucket);
    });

    it("returns decoded empty root bucket", () => {
      const context = { isTail: true, isHead: true };
      const addressed = encodeBucket(32, level, [], context);
      const decodedBucket = decodeBucket(addressed, context);
      expect(decodedBucket).toEqual(emptyBucket);
    });

    it("throws when level > MAX_LEVEL", () => {
      const bytes = encode({
        average,
        level: MAX_TREE_LEVEL + 1,
        entries: [createEntry(1), createEntry(2)],
      });
      const digest = sha256(bytes);

      const context = { isTail: true, isHead: true };

      expect(() => decodeBucket({ bytes, digest }, context)).toThrow(
        "invalid bucket.",
      );
    });

    it("throws when non-root bucket has less than one entry", () => {
      const context = { isTail: false, isHead: true };

      expect(() => decodeBucket(emptyAddressed, context)).toThrow(
        "non-root bucket must have at least one entry.",
      );
    });

    it("throws when root bucket level > 0 has less than two entries", () => {
      const bytes = encode({ average, level: 1, entries: [] });
      const digest = sha256(bytes);

      const context = { isTail: true, isHead: true };

      expect(() => decodeBucket({ bytes, digest }, context)).toThrow(
        "root bucket on level > 0 must have at least two entries.",
      );
    });

    it("throws when max key range not equal to last entry", () => {
      expect(() =>
        decodeBucket(addressed, context, {
          range: ["MIN_KEY", "MIN_KEY"],
        }),
      ).toThrow("Last entry must equal max key range.");
    });

    it("throws when min key range greater than some entries", () => {
      expect(() =>
        decodeBucket(addressed, context, {
          range: [key, key],
        }),
      ).toThrow("Entry must be greater than min key range.");
    });

    it("throws when prefix mismatch", () => {
      expect(() =>
        decodeBucket(addressed, context, {
          prefix: {
            average: 1,
            level,
          },
        }),
      ).toThrow("prefix mismatch.");
    });
  });
});
