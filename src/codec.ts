/**
 * Safely encodes and decodes buckets using context of the tree structure.
 */

import { decode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { IsBoundary, createIsBoundary } from "./boundary.js";
import { compareTuples } from "./compare.js";
import { MAX_LEVEL, MAX_UINT32 } from "./constants.js";
import { DefaultEntry } from "./impls.js";
import {
  Addressed,
  CommittedBucket,
  Context,
  Entry,
  Prefix,
  Tuple,
} from "./interface.js";
import { createBucket } from "./utils.js";

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

export const isEncodedBucket = (b: any): b is EncodedBucket =>
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

    if (compareTuples(entry, next) >= 0) {
      throw new TypeError("Entries must be sorted and non-duplicative.");
    }

    if (isBoundary(entry)) {
      throw new TypeError("Only the last entry of a bucket can be a boundary.");
    }
  }
};

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
  if (
    range != null &&
    entries[0] != null &&
    compareTuples(range[0], entries[0]) >= 0
  ) {
    throw new TypeError("First entry must be greater than min tuple range.");
  }

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

    if (!isEncodedEntry(encodedEntry)) {
      throw new TypeError("invalid encoded entry.");
    }

    const [delta, key, val] = encodedEntry;

    const next = entries[i + 1]!;

    const seq = (next?.seq ?? base) - delta;

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
  context: Omit<Context, "parentIndex">, // parentIndex is not relevant to encoding
  expected?: Expected,
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
    expected?.range,
  );

  const bytes = encode({
    average,
    level,
    base,
    entries: encodedEntries,
  });

  return {
    bytes,
    digest: sha256(bytes),
  };
}

/**
 * Safely decodes a CBOR encoded byte array into a bucket.
 *
 * @param bytes
 * @param predicates
 * @returns
 */
export function decodeBucket(
  addressed: Addressed,
  context: Context,
  expected?: Expected,
): CommittedBucket {
  const decoded = decode(addressed.bytes);

  if (!isEncodedBucket(decoded)) {
    throw new TypeError("invalid bucket.");
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
    decoded.entries,
    decoded.base,
    context.isHead,
    createIsBoundary(decoded.average, decoded.level),
    expected?.range,
  );

  return createBucket(
    decoded.average,
    decoded.level,
    entries,
    addressed,
    context,
  );
}
