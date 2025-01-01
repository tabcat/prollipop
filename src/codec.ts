/**
 * Safe bucket encoding and decoding.
 *
 * Checks properties of the bucket and its entries using context: { isTail, isHead }.
 * Ensures only valid buckets are encoded or decoded.
 *
 * Properties that must be satisfied:
 * - Bucket shape is valid.
 * - Bucket entries have minimum length 0/1/2 for root (level 0)/non-root/root (level > 0).
 * - Entries are valid, sorted and non-duplicative.
 */

import { decode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { IsBoundary, createIsBoundary } from "./boundary.js";
import { compareTuples } from "./compare.js";
import { MAX_LEVEL, MAX_UINT32 } from "./constants.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import {
  Addressed,
  Bucket,
  Context,
  Entry,
  Prefix,
  Tuple,
} from "./interface.js";

export type EncodedEntry = [number, Entry["key"], Entry["val"]];

export interface EncodedBucket extends Prefix {
  entries: EncodedEntry[];
}

const isPositiveInteger = (n: unknown): n is number =>
  typeof n === "number" && n >= 0 && Number.isInteger(n);

export const isEntry = (e: any): e is Entry =>
  typeof e === "object" &&
  e !== null &&
  Object.keys(e).length === 3 &&
  isPositiveInteger(e.seq) &&
  e.key instanceof Uint8Array &&
  e.val instanceof Uint8Array;

export const isEncodedEntry = (e: any): e is EncodedEntry =>
  Array.isArray(e) &&
  e.length === 3 &&
  isPositiveInteger(e[0]) &&
  e[1] instanceof Uint8Array &&
  e[2] instanceof Uint8Array;

export const isBucket = (b: any): b is EncodedBucket =>
  typeof b === "object" &&
  b !== null &&
  Object.keys(b).length === 4 &&
  Number.isInteger(b.average) &&
  b.average > 1 &&
  b.average < Number(MAX_UINT32) &&
  isPositiveInteger(b.level) &&
  b.level <= MAX_LEVEL &&
  isPositiveInteger(b.base) &&
  Array.isArray(b.entries); // check that entries are valid later

/**
 * Throws if the relation between the entry and the next entry is invalid.
 *
 * Ensures that entry is less than next by tuple sort.
 * Ensures that entry is only a boundary if it is the last entry in the bucket.
 * Optionally ensures that entry is within the range.
 *
 * @param entry
 * @param next
 * @param isHead
 * @param isBoundary
 * @param range
 */
export const validateEntryRelation = (
  entry: Entry,
  next: Entry | undefined,
  isHead: boolean,
  isBoundary: IsBoundary,
  range?: TupleRange,
): void => {
  if (next == null) {
    // entry is last entry of bucket

    if (!isHead && !isBoundary(entry)) {
      throw new TypeError(
        "Last entry must be a boundary unless inside a head bucket.",
      );
    }

    if (range != null && compareTuples(entry, range[1]) !== 0) {
      throw new TypeError("Last entry must equal max tuple range.");
    }
  } else {
    // entry is not last entry of bucket

    if (compareTuples(entry, next) >= 0) {
      throw new TypeError("Entries must be sorted and non-duplicative.");
    }

    if (isBoundary(entry)) {
      throw new TypeError("Only the last entry of a bucket can be a boundary.");
    }
  }
};

/**
 * Throws if the prefix of the bucket does not match the expected prefix.
 *
 * @param prefix
 * @param expected
 */
export const validatePrefixExpected = (
  prefix: Prefix,
  expected: Prefix,
): void => {
  if (
    prefix.average !== expected.average ||
    prefix.level !== expected.level ||
    prefix.base !== expected.base
  ) {
    throw new TypeError("prefix mismatch.");
  }
};

/**
 * Throws if the length of the entries does not meet the minimum length.
 *
 * @param length
 * @param level
 * @param isRoot
 */
export const validateEntriesLength = (
  length: number,
  level: number,
  isRoot: boolean,
): void => {
  // only root buckets on level 0 can have 0 entries

  if (!isRoot && length < 1) {
    throw new TypeError("non-root bucket must have at least one entry.");
  }

  if (isRoot && level > 0 && length < 2) {
    throw new TypeError(
      "root bucket on level > 0 must have at least two entries.",
    );
  }
};

/**
 * Encodes entries and delta encodes their seq value while validating entry shape and relation.
 *
 * @param entries
 * @param isHead
 * @param isBoundary
 * @returns
 */
export function encodeEntries(
  entries: Entry[],
  isHead: boolean,
  isBoundary: IsBoundary,
): [EncodedEntry[], number] {
  const encodedEntries: EncodedEntry[] = new Array(entries.length);
  let base = 0;

  let i = entries.length;
  while (i > 0) {
    i--;

    const entry = entries[i]!;

    if (!isEntry(entry)) {
      throw new TypeError("invalid entry.");
    }

    if (i === entries.length - 1) base = entry.seq;

    const next = entries[i + 1];

    validateEntryRelation(entry, next, isHead, isBoundary);

    // entry seq is delta encoded
    const delta = (next?.seq ?? base) - entry.seq;

    encodedEntries[i] = [delta, entry.key, entry.val];
  }

  return [encodedEntries, base];
}

/**
 * Decodes entries and replaces their delta encoded seq with the original value.
 * Validates entry shape, relation, and optionally range.
 *
 * @param encodedEntries
 * @param base
 * @param isHead
 * @param isBoundary
 * @param range
 * @returns
 */
export function decodeEntries(
  base: number,
  encodedEntries: EncodedEntry[],
  isHead: boolean,
  isBoundary: IsBoundary,
  range?: TupleRange,
): Entry[] {
  const entries: Entry[] = new Array(encodedEntries.length);

  let i = encodedEntries.length;
  while (i > 0) {
    i--;

    const encodedEntry = encodedEntries[i];

    if (!isEncodedEntry(encodedEntry)) {
      throw new TypeError("invalid encoded entry.");
    }

    const [delta, key, val] = encodedEntry;

    const next = entries[i + 1]!;

    const seq = (next?.seq ?? base) - delta;

    if (seq < 0) {
      throw new TypeError("Entry seq must be greater than 0.");
    }

    const entry = new DefaultEntry(seq, key, val);

    validateEntryRelation(entry, next, isHead, isBoundary, range);

    entries[i] = entry;
  }

  if (
    range != null &&
    entries[0] != null &&
    compareTuples(range[0], entries[0]) >= 0
  ) {
    throw new TypeError("Entry must be greater than min tuple range.");
  }

  return entries;
}

export interface Expected {
  prefix?: Prefix;
  range?: TupleRange;
}

export interface TupleRange {
  /**
   * Exclusive lower bound.
   */
  0: Tuple;

  /**
   * Inclusive upper bound.
   */
  1: Tuple;
}

/**
 * Safely CBOR encodes bucket prefix and entries.
 * Validates entries length based on context.
 *
 * @param average
 * @param level
 * @param entries
 * @param context
 * @returns
 */
export function encodeBucket(
  average: number,
  level: number,
  entries: Entry[],
  context: Context,
): Addressed {
  validateEntriesLength(
    entries.length,
    level,
    context.isTail && context.isHead,
  );

  const [encodedEntries, base] = encodeEntries(
    entries,
    context.isHead,
    createIsBoundary(average, level),
  );

  const encodedBucket: EncodedBucket = {
    average,
    level,
    base,
    entries: encodedEntries,
  };

  if (!isBucket(encodedBucket)) {
    throw new TypeError("invalid bucket.");
  }

  const bytes = encode(encodedBucket);

  return {
    bytes,
    digest: sha256(bytes),
  };
}

/**
 * Safely CBOR decodes a bucket.
 * Validates bucket shape and entries length based on context.
 * Optionally compares prefix to an expected prefix and entries to an expected range.
 *
 * @param addressed
 * @param context
 * @param expected
 * @returns
 */
export function decodeBucket(
  addressed: Addressed,
  context: Context,
  expected?: Expected,
): Bucket {
  const decoded = decode(addressed.bytes);

  if (!isBucket(decoded)) {
    throw new TypeError("invalid bucket.");
  }

  if (decoded.level > MAX_LEVEL) {
    throw new Error("bucket level exceeds maximum allowed level.");
  }

  if (expected?.prefix != null) {
    validatePrefixExpected(decoded, expected.prefix);
  }

  validateEntriesLength(
    decoded.entries.length,
    decoded.level,
    context.isTail && context.isHead,
  );

  const entries = decodeEntries(
    decoded.base,
    decoded.entries,
    context.isHead,
    createIsBoundary(decoded.average, decoded.level),
    expected?.range,
  );

  return new DefaultBucket(
    decoded.average,
    decoded.level,
    entries,
    addressed,
    context,
  );
}
