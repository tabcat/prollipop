import { compare as compareBytes } from "uint8arrays";
import { BucketDiff } from "./diff.js";
import { Bucket, Entry, Tuple } from "./interface.js";

export { compareBytes };

export const compareSeq = (a: number, b: number): number => a - b;

/**
 * A tuple that is less than all other tuples.
 * Normally a tuple seq is a positive integer.
 * This is not valid for an entry but can be used for comparisons and Tuple Ranges.
 */
export const minTuple = { seq: -1, key: new Uint8Array(0) };

/**
 * Compare two tuples.
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
 * Compare two entries.
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
  compareBytes(a.getDigest(), b.getDigest());

/**
 * Compare two buckets by their boundaries.
 * If a bucket does not have a boundary because it is empty, that bucket is first.
 * If both buckets are empty the 0 is returned.
 *
 * @param a
 * @param b
 * @returns
 */
export const compareBoundaries = (a: Bucket, b: Bucket): number => {
  // buckets are first ordered by level
  const levelComparison = a.level - b.level;

  if (levelComparison !== 0) return levelComparison;

  const aBoundary = a.getBoundary();
  const bBoundary = b.getBoundary();

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
 * Compare two buckets.
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
