import { compareBytes } from "./compare.js";
import { AwaitIterable, KeyLike } from "./interface.js";
import { toKey } from "./utils.js";

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
export function findUpperBound<T, U>(
  arr: T[],
  target: U,
  compare: (a: T, b: U) => number,
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
 * Ensures that keys is sorted and duplicate free.
 * Handles empty KeyLike arrays.
 *
 * @param keys
 * @returns
 */
export async function* ensureSortedKeysIterable(
  keys: AwaitIterable<KeyLike[]>,
) {
  let previous: Uint8Array | null = null;

  for await (const _keys of keys) {
    if (_keys.length === 0) continue;

    for (let k of _keys) {
      const key = toKey(k);
      if (previous != null && compareBytes(previous, key) >= 0) {
        throw new Error("keys are unsorted or duplicate.");
      }

      previous = key;
    }

    yield _keys;
  }
}
