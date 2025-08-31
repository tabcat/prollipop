/**
 * Comparison functions for bytes, entries, buckets, and bucket diffs.
 *
 * Entries are sorted by:
 * 1. key
 * 2. val (value)
 *
 * Buckets are sorted by:
 * 1. level (depth in the tree)
 * 2. boundary (key)
 * 3. digest (bucket hash)
 */

import { compare as compareBytes } from "uint8arrays";
import { Bucket, ComparableKey, Entry } from "./interface.js";
import { getBucketBoundary } from "./utils.js";

export { compareBytes };

export interface Comparitor<T> {
  (a: T, b: T): number;
}

export const composeComparators = <T>(
  ...comparitors: Comparitor<T>[]
): Comparitor<T> => {
  return (a: T, b: T): number => {
    for (const comparitor of comparitors) {
      const comparison = comparitor(a, b);
      if (comparison !== 0) return comparison;
    }

    return 0;
  };
};

export const compareKeys = (a: ComparableKey, b: ComparableKey): number => {
  if (a === b) return 0;

  if (a === "MIN_KEY") return -1;
  if (b === "MIN_KEY") return 1;

  if (a === "MAX_KEY") return 1;
  if (b === "MAX_KEY") return -1;

  return compareBytes(a, b);
};

/**
 * Compare two entries. key > val
 *
 * @param a
 * @param b
 * @returns
 */
export const compareEntries = (a: Entry, b: Entry): number =>
  composeComparators<Entry>(
    (a, b) => compareBytes(a.key, b.key),
    (a, b) => compareBytes(a.val, b.val),
  )(a, b);

/**
 * Compare two buckets by their digests.
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBucketDigests = (a: Bucket, b: Bucket): number =>
  compareBytes(a.getAddressed().digest, b.getAddressed().digest);

export const compareLevels = (a: Bucket, b: Bucket): number =>
  a.level - b.level;

/**
 * Compare two buckets by their boundaries.
 * If a bucket does not have a boundary because it is empty, that bucket is first.
 * If both buckets are empty then 0 is returned.
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBoundaries = (a: Bucket, b: Bucket): number => {
  const aBoundary = getBucketBoundary(a);
  const bBoundary = getBucketBoundary(b);

  // empty buckets first
  // wondering if empty bucket should be last
  if (aBoundary == null && bBoundary == null) {
    return 0;
  } else if (aBoundary == null) {
    return -1;
  } else if (bBoundary == null) {
    return 1;
  }

  return compareBytes(aBoundary.key, bBoundary.key);
};

/**
 * Compare two buckets. level > boundary > digest
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBuckets = composeComparators(
  compareLevels,
  compareBoundaries,
  compareBucketDigests,
);
