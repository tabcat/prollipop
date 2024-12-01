/**
 * Safely encodes and decodes buckets with context of the tree structure.
 */

import { decode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { IsBoundary, createIsBoundary } from "./boundary.js";
import { compareEntries, compareTuples } from "./compare.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import { Bucket, Entry, Prefix, Tuple } from "./interface.js";
import { isPositiveInteger, tupleRangeOfEntries } from "./utils.js";

export type EncodedEntry = [number, Entry["key"], Entry["val"]];

export interface EncodedBucket extends Prefix {
  entries: EncodedEntry[];
}

export const isValidEntry = (e: any): e is Entry =>
  typeof e === "object" &&
  e !== null &&
  isPositiveInteger(e.seq) &&
  e.key instanceof Uint8Array &&
  e.val instanceof Uint8Array;

export const isValidEncodedEntry = (e: any): e is EncodedEntry =>
  Array.isArray(e) &&
  isPositiveInteger(e[0]) &&
  e[1] instanceof Uint8Array &&
  e[2] instanceof Uint8Array;

export const isValidEncodedBucket = (b: any): b is EncodedBucket =>
  typeof b === "object" &&
  b !== null &&
  isPositiveInteger(b.average) &&
  isPositiveInteger(b.level) &&
  isPositiveInteger(b.base) &&
  Array.isArray(b.entries); // check that entries are valid later

/**
 * Ensures that entries are sorted and non-duplicative.
 * Ensures that isHead or isBoundary for last entry of bucket.
 * Ensures that !isBoundary for all other entries.
 *
 * @param entry
 * @param next
 * @param isHead
 * @param isBoundary
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
    if (compareEntries(entry, next) >= 0) {
      throw new TypeError("Entries must be sorted and non-duplicative.");
    }

    if (isBoundary(entry)) {
      throw new TypeError("Buckets can have only one boundary.");
    }

    if (range != null && compareTuples(entry, range[0]) > 0) {
      throw new TypeError("Entry must be greater than min tuple range.");
    }
  }
};

/**
 * Encodes entries and replaces their seq with a delta encoded value.
 *
 * @param entries
 * @param isHead
 * @param isBoundary
 * @param range
 * @returns
 */
export function encodeEntries(
  entries: Entry[],
  isHead: boolean,
  isBoundary: IsBoundary,
  range?: TupleRange,
): [EncodedEntry[], number] {
  const encodedEntries: EncodedEntry[] = new Array(entries.length);
  let base = 0;

  let i = entries.length;
  while (i > 0) {
    i--;

    const entry = entries[i]!;

    if (!isValidEntry(entry)) {
      throw new TypeError("invalid entry.");
    }

    if (i === entries.length - 1) base = entry.seq;

    const next = entries[i + 1];

    validateEntryRelation(entry, next, isHead, isBoundary, range);

    // entry seq is delta encoded
    const delta = (next?.seq ?? base) - entry.seq;

    encodedEntries[i] = [delta, entry.key, entry.val];
  }

  return [encodedEntries, base];
}

/**
 * Decodes entries and replaces their delta encoded seq with the original value.
 *
 * @param encodedEntries
 * @param base
 * @param isHead
 * @param isBoundary
 * @param range
 * @returns
 */
export function decodeEntries(
  encodedEntries: EncodedEntry[],
  base: number,
  isHead: boolean,
  isBoundary: IsBoundary,
  range?: TupleRange,
): Entry[] {
  const entries: Entry[] = new Array(encodedEntries.length);

  let i = encodedEntries.length;
  while (i > 0) {
    i--;

    const encodedEntry = encodedEntries[i];

    if (!isValidEncodedEntry(encodedEntry)) {
      throw new TypeError("invalid encoded entry.");
    }

    const [delta, key, val] = encodedEntry;

    const next = entries[i + 1]!;

    const seq = (next?.seq ?? base) - delta;

    const entry = new DefaultEntry(seq, key, val);

    validateEntryRelation(entry, next, isHead, isBoundary, range);

    entries[i] = entry;
  }

  return entries;
}

export interface CodecPredicates {
  /**
   * Used to check if bucket must end in boundary.
   */
  isHead: boolean;

  /**
   * Used to check if bucket can be empty.
   */
  isRoot: boolean;

  /**
   * Used to check if entries fall inside of range.
   */
  range?: TupleRange;

  /**
   * Used to check if fetched prefix matches expected prefix.
   */
  expectedPrefix?: Prefix;
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
 * Safely encodes bucket prefix and entries into a CBOR encoded byte array.
 *
 * @param average
 * @param level
 * @param entries
 * @param predicates
 * @returns
 */
export function encodeBucket(
  average: number,
  level: number,
  entries: Entry[],
  { isRoot, isHead, range }: CodecPredicates,
): Uint8Array {
  if (!isRoot && entries.length === 0) {
    throw new TypeError("empty non-root bucket.");
  }

  const isBoundary = createIsBoundary(average, level);

  const [encodedEntries, base] = encodeEntries(
    entries,
    isHead,
    isBoundary,
    range ?? tupleRangeOfEntries(entries),
  );

  return encode({
    average,
    level,
    base,
    entries: encodedEntries,
  });
}

/**
 * Safely decodes a CBOR encoded byte array into a bucket.
 *
 * @param bytes
 * @param predicates
 * @returns
 */
export function decodeBucket(
  bytes: Uint8Array,
  { isHead, isRoot, range, expectedPrefix }: CodecPredicates,
): Bucket {
  const decoded = decode(bytes);

  if (!isValidEncodedBucket(decoded)) {
    throw new TypeError("invalid bucket.");
  }

  if (!isRoot && decoded.entries.length === 0) {
    throw new TypeError("empty non-root bucket.");
  }

  if (
    expectedPrefix != null &&
    (decoded.average !== expectedPrefix.average ||
      decoded.level !== expectedPrefix.level ||
      decoded.base !== expectedPrefix.base)
  ) {
    throw new TypeError("prefix mismatch.");
  }

  const isBoundary = createIsBoundary(decoded.average, decoded.level);

  const entries = decodeEntries(
    decoded.entries,
    decoded.base,
    isHead,
    isBoundary,
    range,
  );

  return new DefaultBucket(
    decoded.average,
    decoded.level,
    entries,
    bytes,
    sha256(bytes),
  );
}
