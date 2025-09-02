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
import { toReversed } from "./common.js";
import {
  compareBucketDigests,
  compareBuckets,
  compareBytes,
  compareEntries,
  compareKeys,
} from "./compare.js";
import {
  createCursor,
  Cursor,
  getCurrentBucket,
  getCurrentEntry,
  getCurrentLevel,
  next,
  nextBucket,
} from "./cursor/index.js";
import {
  Blockfetcher,
  Bucket,
  ComparableKey,
  Entry,
  ProllyTree,
} from "./interface.js";
import {
  doRangesIntersect,
  getBucketBoundary,
  getEntryRange,
} from "./utils.js";

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
  leftBuckets: Iterable<Bucket>,
  rightBuckets: Iterable<Bucket>,
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
  while (!lc.isDone && !rc.isDone) {
    const level = getCurrentLevel(lc);

    if (compareEntries(getCurrentEntry(lc), getCurrentEntry(rc)) === 0) {
      const matchingBucketsLength = getMatchingBucketsLength(
        toReversed(lc.currentBuckets),
        toReversed(rc.currentBuckets),
      );

      // moves across matching buckets when cursors are equal
      await Promise.all([
        next(lc, matchingBucketsLength + level),
        next(rc, matchingBucketsLength + level),
      ]);
    } else {
      if (level > 1) {
        await Promise.all([next(lc, level - 1), next(rc, level - 1)]);
      } else {
        break;
      }
    }
  }

  await Promise.all([
    getCurrentLevel(lc) === 0 || lc.isDone ? Promise.resolve() : next(lc, 0),
    getCurrentLevel(rc) === 0 || rc.isDone ? Promise.resolve() : next(rc, 0),
  ]);
}

export function writeEntryDiffs(
  lEntries: Entry[],
  rEntries: Entry[],
  cutoff: ComparableKey,
  d: ProllyTreeDiff,
): [Entry[], Entry[]] {
  const lLeftovers: Entry[] = [];
  const rLeftovers: Entry[] = [];

  for (const [le, re] of pairwiseTraversal(lEntries, rEntries, (a, b) =>
    compareBytes(a.key, b.key),
  )) {
    if (compareKeys(le?.key ?? (re?.key as Uint8Array), cutoff) <= 0) {
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
    toReversed(lastBuckets),
    toReversed(currentBuckets),
    compareBuckets,
  );

  if (done) {
    yield* toReversed(currentBuckets); // lowest levels first
  }
}

export async function* diff(
  blockstore: Blockfetcher,
  left: ProllyTree,
  right: ProllyTree,
  rightBlockstore?: Blockfetcher,
): AsyncIterable<ProllyTreeDiff> {
  rightBlockstore = rightBlockstore ?? blockstore;

  let d = createProllyTreeDiff();

  const lc = createCursor(blockstore, left);
  const rc = createCursor(rightBlockstore, right);

  // move cursors to the same level
  if (getCurrentLevel(lc) > getCurrentLevel(rc)) {
    await next(lc, getCurrentLevel(rc));
  }
  if (getCurrentLevel(rc) > getCurrentLevel(lc)) {
    await next(rc, getCurrentLevel(lc));
  }

  // handle empty trees
  if (
    lc.isDone &&
    compareBucketDigests(getCurrentBucket(lc), getCurrentBucket(rc)) !== 0
  ) {
    d.buckets.push([getCurrentBucket(lc), null] as BucketDiff);
  }
  if (
    rc.isDone &&
    compareBucketDigests(getCurrentBucket(lc), getCurrentBucket(rc)) !== 0
  ) {
    d.buckets.push([null, getCurrentBucket(rc)] as BucketDiff);
  }

  await unequalizeBuckets(lc, rc);
  // buckets are different and level 0 or one or more cursors done;

  let lLeftovers: Entry[] = [];
  let rLeftovers: Entry[] = [];

  while (!lc.isDone && !rc.isDone) {
    const lb = getCurrentBucket(lc);
    const rb = getCurrentBucket(rc);

    const bucketComparison = compareBuckets(lb, rb);

    const lesser: Bucket = bucketComparison < 0 ? lb : rb;

    const intersect = doRangesIntersect(
      getEntryRange(lb.entries),
      getEntryRange(rb.entries),
    );

    const lLastBuckets = lc.currentBuckets;
    const rLastBuckets = rc.currentBuckets;

    if (bucketComparison === 0) {
      await unequalizeBuckets(lc, rc);
    } else {
      if (intersect) {
        await Promise.all([nextBucket(lc, 0), nextBucket(rc, 0)]);
      } else {
        lesser === lb ? await nextBucket(lc, 0) : await nextBucket(rc, 0);
      }
    }

    [lLeftovers, rLeftovers] = writeEntryDiffs(
      intersect || lesser === lb ? [...lLeftovers, ...lb.entries] : lLeftovers,
      intersect || lesser === rb ? [...rLeftovers, ...rb.entries] : rLeftovers,
      lc.isDone && rc.isDone ? "MAX_KEY" : getBucketBoundary(lesser)!.key,
      d,
    );

    for (const diff of orderedDiff(
      getDifferentBuckets(lLastBuckets, lc.currentBuckets, lc.isDone),
      getDifferentBuckets(rLastBuckets, rc.currentBuckets, rc.isDone),
      compareBuckets,
    )) {
      d.buckets.push(diff);
    }

    yield d;
    d = createProllyTreeDiff();
  }

  while (!lc.isDone) {
    const lb = getCurrentBucket(lc);

    const lLastBuckets = lc.currentBuckets;
    await nextBucket(lc, 0);

    [lLeftovers, rLeftovers] = writeEntryDiffs(
      [...lLeftovers, ...lb.entries],
      rLeftovers,
      lc.isDone ? "MAX_KEY" : getBucketBoundary(lb)!.key,
      d,
    );

    for (const b of getDifferentBuckets(
      lLastBuckets,
      lc.currentBuckets,
      lc.isDone,
    )) {
      d.buckets.push([b, null] as BucketDiff);
    }

    yield d;
    d = createProllyTreeDiff();
  }

  while (!rc.isDone) {
    const rb = getCurrentBucket(rc);

    const rLastBuckets = rc.currentBuckets;
    await nextBucket(rc, 0);

    [lLeftovers, rLeftovers] = writeEntryDiffs(
      lLeftovers,
      [...rLeftovers, ...rb.entries],
      rc.isDone ? "MAX_KEY" : getBucketBoundary(rb)!.key,
      d,
    );

    for (const b of getDifferentBuckets(
      rLastBuckets,
      rc.currentBuckets,
      rc.isDone,
    )) {
      d.buckets.push([null, b] as BucketDiff);
    }

    yield d;
    d = createProllyTreeDiff();
  }
}
