/**
 * Implements efficient prolly-tree diff.
 *
 * Originally implemented https://www.dolthub.com/blog/2020-06-16-efficient-diff-on-prolly-trees/
 * Now traverses buckets of entries instead of entries. This reduces async work.
 *
 */

import {
  Diff,
  difference,
  ExclusiveDiff,
  diff as orderedDiff,
} from "@tabcat/sorted-sets/difference";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import {
  compareBLD,
  compareBucketDigests,
  compareEntries,
  compareTuples,
} from "./compare.js";
import { MAX_TUPLE } from "./constants.js";
import { createCursor } from "./cursor.js";
import { Bucket, Cursor, Entry, ProllyTree, Tuple } from "./interface.js";
import { getBucketBoundary, getEntryRange, hasIntersect } from "./utils.js";

export type EntryDiff = Diff<Entry>;
export type BucketDiff = ExclusiveDiff<Bucket>;

export interface ProllyTreeDiff {
  entries: EntryDiff[];
  buckets: BucketDiff[];
}

/**
 * Create an empty prolly-tree diff
 *
 * @returns
 */
export const createProllyTreeDiff = (): ProllyTreeDiff => ({
  entries: [],
  buckets: [],
});

export const getMatchingBucketsLength = (
  leftBuckets: Bucket[],
  rightBuckets: Bucket[],
) => {
  let matchingBucketsLength = 0;
  for (const [lb, rb] of pairwiseTraversal(
    leftBuckets,
    rightBuckets,
    compareBucketDigests,
  )) {
    if (lb == null || rb == null) {
      break;
    }

    matchingBucketsLength++;
  }

  return matchingBucketsLength;
};

export async function unequalizeBuckets(lc: Cursor, rc: Cursor) {
  while (!lc.done() && !rc.done()) {
    const level = lc.level();

    if (compareEntries(lc.current(), rc.current()) === 0) {
      const matchingBucketsLength = getMatchingBucketsLength(
        lc.buckets().reverse(),
        rc.buckets().reverse(),
      );

      // moves across matching buckets when cursors are equal
      await Promise.all([
        lc.next(matchingBucketsLength + level),
        rc.next(matchingBucketsLength + level),
      ]);
    } else {
      if (level > 1) {
        await Promise.all([lc.next(level - 1), rc.next(level - 1)]);
      } else {
        break;
      }
    }
  }

  await Promise.all([
    lc.level() === 0 || lc.done() ? Promise.resolve() : lc.next(0),
    rc.level() === 0 || rc.done() ? Promise.resolve() : rc.next(0),
  ]);
}

export function writeEntryDiffs(
  lEntries: Entry[],
  rEntries: Entry[],
  cutoff: Tuple,
  d: ProllyTreeDiff,
): [Entry[], Entry[]] {
  const lLeftovers: Entry[] = [];
  const rLeftovers: Entry[] = [];

  for (const [le, re] of pairwiseTraversal(lEntries, rEntries, compareTuples)) {
    if (compareTuples(le ?? re, cutoff) <= 0) {
      if (le == null || re == null || compareEntries(le, re) !== 0) {
        d.entries.push([le, re] as EntryDiff);
      }
      continue;
    }

    if (le != null) {
      lLeftovers.push(le);
    }

    if (re != null) {
      rLeftovers.push(re);
    }
  }

  return [lLeftovers, rLeftovers];
}

export function* getDifferentBuckets(
  lastBuckets: Bucket[],
  currentBuckets: Bucket[],
  done: boolean,
): Iterable<Bucket> {
  yield* difference(
    lastBuckets.sort(compareBLD),
    currentBuckets.sort(compareBLD),
    compareBLD,
  );

  if (done) {
    // already sorted to BLD
    yield* currentBuckets;
  }
}

export async function* diff(
  blockstore: Blockstore,
  left: ProllyTree,
  right: ProllyTree,
  rightBlockstore?: Blockstore,
): AsyncIterable<ProllyTreeDiff> {
  rightBlockstore = rightBlockstore ?? blockstore;

  let d = createProllyTreeDiff();

  const lc = createCursor(blockstore, left);
  const rc = createCursor(rightBlockstore, right);

  // move cursors to the same level
  if (lc.level() > rc.level()) {
    await lc.next(rc.level());
  }
  if (rc.level() > lc.level()) {
    await rc.next(lc.level());
  }

  await unequalizeBuckets(lc, rc);
  // buckets are different and level 0 or one or more cursors done;

  let lLeftovers: Entry[] = [];
  let rLeftovers: Entry[] = [];

  while (!lc.done() && !rc.done()) {
    const lb = lc.currentBucket();
    const rb = rc.currentBucket();

    const bucketComparison = compareBLD(lb, rb);

    const lesser: Bucket = bucketComparison < 0 ? lb : rb;

    const intersect = hasIntersect(
      getEntryRange(lb.entries),
      getEntryRange(rb.entries),
    );

    const lLastBuckets = lc.buckets();
    const rLastBuckets = rc.buckets();

    if (bucketComparison === 0) {
      await unequalizeBuckets(lc, rc);
    } else {
      if (intersect) {
        await Promise.all([lc.nextBucket(0), rc.nextBucket(0)]);
      } else {
        lesser === lb ? await lc.nextBucket(0) : await rc.nextBucket(0);
      }
    }

    [lLeftovers, rLeftovers] = writeEntryDiffs(
      intersect || lesser === lb ? [...lLeftovers, ...lb.entries] : lLeftovers,
      intersect || lesser === rb ? [...rLeftovers, ...rb.entries] : rLeftovers,
      lc.done() && rc.done() ? MAX_TUPLE : getBucketBoundary(lesser)!,
      d,
    );

    for (const diff of orderedDiff(
      getDifferentBuckets(lLastBuckets, lc.buckets(), lc.done()),
      getDifferentBuckets(rLastBuckets, rc.buckets(), rc.done()),
      compareBLD,
    )) {
      d.buckets.push(diff);
    }

    yield d;
    d = createProllyTreeDiff();
  }

  while (!lc.done()) {
    const lb = lc.currentBucket();

    const lLastBuckets = lc.buckets().sort(compareBLD);
    await lc.nextBucket(0);

    [lLeftovers, rLeftovers] = writeEntryDiffs(
      [...lLeftovers, ...lb.entries],
      rLeftovers,
      lc.done() ? MAX_TUPLE : getBucketBoundary(lb)!,
      d,
    );

    for (const b of getDifferentBuckets(
      lLastBuckets,
      lc.buckets(),
      lc.done(),
    )) {
      d.buckets.push([b, null] as BucketDiff);
    }

    yield d;
    d = createProllyTreeDiff();
  }

  while (!rc.done()) {
    const rb = rc.currentBucket();

    const rLastBuckets = rc.buckets().sort(compareBLD);
    await rc.nextBucket(0);

    [lLeftovers, rLeftovers] = writeEntryDiffs(
      lLeftovers,
      [...rLeftovers, ...rb.entries],
      rc.done() ? MAX_TUPLE : getBucketBoundary(rb)!,
      d,
    );

    for (const b of getDifferentBuckets(
      rLastBuckets,
      rc.buckets(),
      rc.done(),
    )) {
      d.buckets.push([null, b] as BucketDiff);
    }

    yield d;
    d = createProllyTreeDiff();
  }
}
