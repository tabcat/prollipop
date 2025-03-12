import { ensureSortedSet } from "@tabcat/sorted-sets/util";
import { compareTuples } from "./compare.js";
import { AwaitIterable, Tuple } from "./interface.js";

/**
 * Finds the index of the target using binary search.
 * Returns -1 if the target is not found.
 * Returns the array length if the target is greater than all elements.
 * Returns 0 if the target is less than all elements.
 *
 * @param arr
 * @param target
 * @param compare
 * @returns
 */
export function findIndexFast<T>(
  arr: T[],
  target: T,
  compare: (a: T, b: T) => number,
): number {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const cmp = compare(arr[mid]!, target);

    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }

  return -1;
}

/**
 * Finds the index of the first element to be greater than the target.
 * Returns the array length if the target is greater than all elements.
 * Returns 0 if the target is less than all elements.
 *
 * @param arr
 * @param target
 * @param compare
 * @returns
 */
export function findUpperBound<T>(
  arr: T[],
  target: T,
  compare: (a: T, b: T) => number,
) {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const cmp = compare(arr[mid]!, target);

    if (cmp <= 0) low = mid + 1;
    else high = mid - 1;
  }

  return low;
}

/**
 * Creates an [async] iterable that can be continued from the same point by separate consumers.
 *
 * @example
 * const iterable = createSharedAwaitIterable([1, 2]);
 *
 * for await (const n of iterable) {
 *   console.log(n); // 1
 *   break;
 * }
 *
 * for await (const n of iterable) {
 *   console.log(n); // 2
 * }
 *
 * @param it
 * @returns
 */
export function createSharedAwaitIterable<T>(
  it: AwaitIterable<T>,
): AwaitIterable<T> {
  // prefer sync iterator
  if (Symbol.iterator in it) {
    const iterator = it[Symbol.iterator]();
    return {
      [Symbol.iterator]() {
        return {
          next: () => iterator.next(),
        };
      },
    };
  }

  if (Symbol.asyncIterator in it) {
    const iterator = it[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => iterator.next(),
        };
      },
    };
  }

  throw new Error("Provided iterable does not support iterator methods.");
}

/**
 * Ensures that the tuples are sorted and duplicate free.
 *
 * @param tuples
 * @returns
 */
export async function* ensureSortedTuplesIterable(
  tuples: AwaitIterable<Tuple[]>,
) {
  let previous: Tuple | null = null;

  for await (const t of tuples) {
    if (t.length === 0) continue;

    try {
      for (const _ of ensureSortedSet(t, compareTuples));
    } catch (e) {
      throw new Error("tuples are unsorted or duplicate.", { cause: e });
    }

    if (
      t[0] != null &&
      previous != null &&
      compareTuples(previous, t[0]) >= 0
    ) {
      throw new Error("tuples are unsorted or duplicate.");
    }
    previous = t[t.length - 1]!;

    yield t;
  }
}
