/**
 * Comparison functions for bytes, tuples, entries, buckets, and bucket diffs.
 *
 * Entries are sorted by:
 * 1. seq (sequence number)
 * 2. key
 * 3. val (value)
 *
 * Buckets are sorted by:
 * 1. level (depth in the tree)
 * 2. boundary (tuple)
 * 3. digest (bucket hash)
 */

import { compare as compareBytes } from "uint8arrays";
import { BucketDiff } from "./diff.js";
import { Bucket, Entry, Tuple } from "./interface.js";
import { getBucketBoundary } from "./utils.js";

export { compareBytes };

export const compareSeq = (a: number, b: number): number => a - b;

/**
 * Compare two tuples. seq > key
 *
 * @param a
 * @param b
 * @returns
 */
export const compareTuples = (a: Tuple, b: Tuple): number => {
  const difference = compareSeq(a.seq, b.seq);

  if (difference !== 0) return difference;

  const comparison = compareBytes(a.key, b.key);

  return comparison;
};

/**
 * Compare two entries. seq > key > val
 *
 * @param a
 * @param b
 * @returns
 */
export const compareEntries = (a: Entry, b: Entry): number => {
  const tuples = compareTuples(a, b);

  if (tuples !== 0) {
    return tuples;
  }

  return compareBytes(a.val, b.val);
};

/**
 * Compare two buckets by their digests.
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBucketDigests = (a: Bucket, b: Bucket): number =>
  compareBytes(a.getAddressed().digest, b.getAddressed().digest);

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
  // buckets are first ordered by level
  const levelComparison = a.level - b.level;

  if (levelComparison !== 0) return levelComparison;

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

  return compareTuples(aBoundary, bBoundary);
};

/**
 * Compare two buckets. level > boundary > digest
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBuckets = (a: Bucket, b: Bucket): number => {
  const boundaryComparison = compareBoundaries(a, b);

  if (boundaryComparison !== 0) {
    return boundaryComparison;
  }

  return compareBucketDigests(a, b);
};

/**
 * Compare two bucket diffs.
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBucketDiffs = (a: BucketDiff, b: BucketDiff): number =>
  compareBuckets(a[0] ?? a[1], b[0] ?? b[1]);
