import { ensureSortedSet } from "@tabcat/sorted-sets/util";
import { compareTuples } from "./compare.js";
import { AwaitIterable, Tuple } from "./interface.js";

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

export function findDomainIndexFast<T>(
  arr: T[],
  boundary: T,
  compare: (a: T, b: T) => number,
) {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const cmp = compare(arr[mid]!, boundary);

    if (cmp <= 0) low = mid + 1;
    else high = mid - 1;
  }

  return low;
}

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
