import { compare as compareHash } from "uint8arrays";
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

export const compareBucketHashes = <Code extends number, Alg extends number>(
  a: Bucket<Code, Alg>,
  b: Bucket<Code, Alg>,
): number => compareHash(a.getHash(), b.getHash());
