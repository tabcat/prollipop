import { compare as compareHash } from "uint8arrays";
import { Tuple, Node } from "./interface";

export const compareNodes = (a: Node, b: Node): number => {
  const tuples = compareTuples(a, b);

  if (tuples !== 0) {
    return tuples;
  }

  return compareHash(a.message, b.message);
};

export const compareTuples = (a: Tuple, b: Tuple): number => {
  const difference = compareTimestamp(a.timestamp, b.timestamp);

  if (difference !== 0) return difference;

  const comparison = compareHash(a.hash, b.hash);

  return comparison;
};

export const compareTimestamp = (a: number, b: number): number => a - b;

/**
 * Returns the index of the first node which is greater than or equal to the given tuple.
 * If no nodes exist which are greater than or equal to the given tuple then it returns the last index.
 *
 * @param nodes
 * @param tuple
 * @returns
 */
export const findIndexGTE = <T extends Tuple>(
  nodes: T[],
  tuple: Tuple,
): number => {
  let index: number = 0;

  for (const node of nodes) {
    const comparison = compareTuples(tuple, node);

    if (comparison <= 0) {
      return index;
    }

    index++;
  }

  return index - 1;
};
