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
import { MAX_LEVEL, minTuple } from "../src/constants.js";
import { DefaultBucket } from "../src/impls.js";
import { Entry } from "../src/interface.js";
import {
  addressed,
  average,
  bucket,
  bytes,
  context,
  createEncodedEntry,
  createEntry,
  emptyAddressed,
  emptyBucket,
  encodedBucket,
  encodedEntries,
  encodedEntry,
  entries,
  entry,
  level,
  seq,
  tuple,
} from "./helpers/constants.js";

describe("codec", () => {
  describe("isEntry", () => {
    it("returns true for a valid entry", () => {
      expect(isEntry(entry)).toBe(true);
    });

    it("returns false for invalid entry", () => {
      expect(isEntry(null)).toBe(false);
      expect(isEntry({})).toBe(false);
      expect(isEntry(tuple)).toBe(false);
      expect(isEntry({ ...entry, oneMore: "field" })).toBe(false);
    });
  });

  describe("isEncodedEntry", () => {
    it("returns true for a valid encoded entry", () => {
      expect(isEncodedEntry([0, bytes, bytes])).toBe(true);
    });

    it("returns false for invalid encoded entry", () => {
      expect(isEncodedEntry(null)).toBe(false);
      expect(isEncodedEntry([])).toBe(false);
      expect(isEncodedEntry([0, bytes, bytes, bytes])).toBe(false);
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
      const [encodedEntries, base] = encodeEntries(entries, false, () => true);
      expect(encodedEntries).toEqual([createEncodedEntry(seq)]);
      expect(base).toEqual(0);
    });

    it("returns encoded entries for a head bucket", () => {
      const [encodedEntries, base] = encodeEntries(entries, true, () => false);
      expect(encodedEntries).toEqual([createEncodedEntry(seq)]);
      expect(base).toEqual(0);
    });

    it("returns delta encoded entry seqs", () => {
      const [encodedEntries, base] = encodeEntries(
        [createEntry(1), createEntry(3)],
        true,
        () => false,
      );
      expect(encodedEntries).toEqual([createEncodedEntry(2), encodedEntry]);
      expect(base).toEqual(3);
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
        0,
        encodedEntries,
        false,
        () => true,
        [minTuple, tuple],
      );
      expect(decodedEntries).toEqual(entries);
    });

    it("returns decoded entries for a head bucket", () => {
      const decodedEntries = decodeEntries(
        0,
        encodedEntries,
        true,
        () => false,
        [minTuple, tuple],
      );
      expect(decodedEntries).toEqual(entries);
    });

    it("returns delta decoded entry seqs", () => {
      const decodedEntries = decodeEntries(
        3,
        [createEncodedEntry(2), encodedEntry],
        true,
        () => false,
        [minTuple, createEntry(3)],
      );
      expect(decodedEntries).toEqual([createEntry(1), createEntry(3)]);
    });

    it("throws when first range[0] >= entries[0]", () => {
      expect(() =>
        decodeEntries(0, [encodedEntry], true, () => false, [entry, entry]),
      ).toThrow("Entry must be greater than min tuple range.");
    });

    it("throws when entries[i] is invalid", () => {
      expect(() =>
        decodeEntries(0, [null as unknown as EncodedEntry], true, () => false),
      ).toThrow("invalid encoded entry.");
    });

    it("throws when entries are not sorted or duplicative", () => {
      expect(() =>
        decodeEntries(0, [encodedEntry, encodedEntry], true, () => false, [
          entry,
          entry,
        ]),
      ).toThrow("Entries must be sorted and non-duplicative.");
    });

    it("throws when decoded seq is negative", () => {
      expect(() =>
        decodeEntries(0, [[1, bytes, bytes], encodedEntry], true, () => false, [
          entry,
          entry,
        ]),
      ).toThrow("Entry seq must be greater than 0.");
    });
  });

  describe("encodeBucket", () => {
    it("returns encoded bucket for a bucket", () => {
      const encodedBucket = encodeBucket(2, level, entries, {
        isTail: false,
        isHead: false,
      });
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
        encodeBucket(average, MAX_LEVEL + 1, [createEntry(1), createEntry(2)], {
          isTail: true,
          isHead: true,
        }),
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
  });

  describe("decodeBucket", () => {
    it("returns decoded bucket for a bucket", () => {
      const context = { isTail: false, isHead: false };
      const addressed = encodeBucket(2, level, entries, context);
      const decodedBucket = decodeBucket(addressed, context, {
        prefix: {
          average: 2,
          level,
          base: 0,
        },
        range: [minTuple, tuple],
      });
      expect(decodedBucket).toEqual(
        new DefaultBucket(2, level, entries, addressed, context),
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
        level: MAX_LEVEL + 1,
        entries: [createEntry(1), createEntry(2)],
        base: 2,
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
      const bytes = encode({ average, level: 1, entries: [], base: 0 });
      const digest = sha256(bytes);

      const context = { isTail: true, isHead: true };

      expect(() => decodeBucket({ bytes, digest }, context)).toThrow(
        "root bucket on level > 0 must have at least two entries.",
      );
    });

    it("throws when max tuple range not equal to last entry", () => {
      expect(() =>
        decodeBucket(addressed, context, {
          range: [minTuple, minTuple],
        }),
      ).toThrow("Last entry must equal max tuple range.");
    });

    it("throws when min tuple range less than all entries", () => {
      expect(() =>
        decodeBucket(addressed, context, {
          range: [tuple, tuple],
        }),
      ).toThrow("Entry must be greater than min tuple range.");
    });

    it("throws when prefix mismatch", () => {
      expect(() =>
        decodeBucket(addressed, context, {
          prefix: {
            average: 1,
            level,
            base: 0,
          },
        }),
      ).toThrow("prefix mismatch.");
    });
  });
});
