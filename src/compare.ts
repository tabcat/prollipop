import { compare as compareHash } from "uint8arrays";
import { Update } from "./builder.js";
import { Bucket, Node, Tuple } from "./interface.js";

export const compareTimestamp = (a: number, b: number): number => a - b;

export const compareTuples = (a: Tuple, b: Tuple): number => {
  const difference = compareTimestamp(a.timestamp, b.timestamp);

  if (difference !== 0) return difference;

  const comparison = compareHash(a.hash, b.hash);

  return comparison;
};

export const compareNodes = (a: Node, b: Node): number => {
  const tuples = compareTuples(a, b);

  if (tuples !== 0) {
    return tuples;
  }

  return compareHash(a.message, b.message);
};

export const compareUpdates = (a: Update, b: Update): number =>
  a.op === "add" && b.op === "add"
    ? compareNodes(a.value, b.value)
    : compareTuples(a.value, b.value);

export const compareBucketHashes = (a: Bucket, b: Bucket): number =>
  compareHash(a.getHash(), b.getHash());

export const compareBuckets = (a: Bucket, b: Bucket): number => {
  const aBoundary = a.getBoundary()
  const bBoundary = b.getBoundary()

  // empty buckets first
  if (aBoundary == null && bBoundary == null) {
    return compareHash(a.getHash(), b.getHash())
  } else if (aBoundary == null){
    return -1
  } else if (bBoundary == null){
    return 1
  }

  // compare level before boundary tuple so builder diffs can be yielded without issues

  const levelComparison = a.prefix.level - b.prefix.level

  if (levelComparison !== 0) return levelComparison

  const tupleComparison = compareTuples(aBoundary, bBoundary)

  if (tupleComparison !== 0) {
    return tupleComparison
  }

  return compareBucketHashes(a, b)
}
