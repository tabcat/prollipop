import { compare as compareBytes } from "uint8arrays";
import { BucketDiff } from "./diff.js";
import { Bucket, Node, Tuple } from "./interface.js";

export { compareBytes };

export const compareTimestamp = (a: number, b: number): number => a - b;

export const compareTuples = (a: Tuple, b: Tuple): number => {
  const difference = compareTimestamp(a.timestamp, b.timestamp);

  if (difference !== 0) return difference;

  const comparison = compareBytes(a.hash, b.hash);

  return comparison;
};

export const compareNodes = (a: Node, b: Node): number => {
  const tuples = compareTuples(a, b);

  if (tuples !== 0) {
    return tuples;
  }

  return compareBytes(a.message, b.message);
};

export const compareBucketDigests = (a: Bucket, b: Bucket): number =>
  compareBytes(a.getDigest(), b.getDigest());

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

export const compareBuckets = (a: Bucket, b: Bucket): number => {
  const boundaryComparison = compareBoundaries(a, b);

  if (boundaryComparison !== 0) {
    return boundaryComparison;
  }

  return compareBucketDigests(a, b);
};

export const compareBucketDiffs = (a: BucketDiff, b: BucketDiff): number =>
  compareBuckets(a[0] ?? a[1], b[0] ?? b[1]);
