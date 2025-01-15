import {
  difference,
  diff as orderedDiff,
} from "@tabcat/sorted-sets/difference";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import {
  compareBoundaries,
  compareBucketDigests,
  compareBuckets,
  compareEntries,
  compareLevels,
  compareTuples,
  composeComparators,
} from "./compare.js";
import { createCursor } from "./cursor.js";
import {
  BucketDiff,
  EntryDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff.js";
import { Bucket, Cursor, Entry, ProllyTree } from "./interface.js";
import { getEntryRange, hasIntersect } from "./utils.js";

const compareBoundaryLevelDigest = composeComparators(
  compareBoundaries,
  compareLevels,
  compareBucketDigests,
);

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

export function diffBucketEntries(
  lEntries: Entry[],
  rEntries: Entry[],
  d: ProllyTreeDiff,
): [Entry[], Entry[]] {
  const lLeftovers: Entry[] = [];
  const rLeftovers: Entry[] = [];

  for (const [le, re, leftDone, rightDone] of pairwiseTraversal(
    lEntries,
    rEntries,
    compareTuples,
  )) {
    if (!leftDone && !rightDone) {
      if (le == null || re == null || compareEntries(le, re) !== 0) {
        d.entries.push([le, re] as EntryDiff);
      }
      continue;
    }

    if (!leftDone && le != null) {
      lLeftovers.push(le);
    }

    if (!rightDone && re != null) {
      rLeftovers.push(re);
    }
  }

  return [lLeftovers, rLeftovers];
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
  // buckets are different and level 0 or one or more cursors done

  // let lLeftovers: Entry[] = [];
  // let rLeftovers: Entry[] = [];

  while (!lc.done() && !rc.done()) {
    const lb = lc.currentBucket();
    const rb = rc.currentBucket();

    const comparison = compareBoundaryLevelDigest(lb, rb);

    const lesser: Cursor = comparison < 0 ? lc : rc;

    const intersect = hasIntersect(
      getEntryRange(lb.entries),
      getEntryRange(rb.entries),
    );

    // for (const [le, re, leftDone, rightDone] of pairwiseTraversal(
    //   intersect || lesser === lc ? [...lLeftovers, ...lb.entries] : lLeftovers,
    //   intersect || lesser === rc ? [...rLeftovers, ...rb.entries] : rLeftovers,
    //   compareTuples,
    // )) {
    //   if (!leftDone && !rightDone) {
    //     if (le == null || re == null || compareEntries(le, re) !== 0) {
    //       d.entries.push([le, re] as EntryDiff);
    //     }

    //     continue;
    //   }

    //   if (!leftDone && le != null) {
    //     lLeftovers.push(le);
    //   }

    //   if (!rightDone && re != null) {
    //     rLeftovers.push(re);
    //   }
    // }

    const lLastBuckets = lc.buckets().reverse();
    const rLastBuckets = rc.buckets().reverse();

    if (comparison === 0) {
      await unequalizeBuckets(lc, rc);
    } else {
      if (intersect) {
        await Promise.all([lc.nextBucket(0), rc.nextBucket(0)]);
      } else {
        await lesser.nextBucket(0);
      }
    }

    const lRemovedBuckets = Array.from(
      difference(lLastBuckets, lc.buckets().reverse(), compareBuckets),
    );
    const rRemovedBuckets = Array.from(
      difference(rLastBuckets, rc.buckets().reverse(), compareBuckets),
    );

    const o = orderedDiff;
    const c = compareBuckets;

    if (lc.done()) {
      lRemovedBuckets.push(...lc.buckets());
      lRemovedBuckets.sort(compareBuckets);
    }

    if (rc.done()) {
      rRemovedBuckets.push(...rc.buckets());
      rRemovedBuckets.sort(compareBuckets);
    }

    for (const diff of orderedDiff(
      lRemovedBuckets,
      rRemovedBuckets,
      compareBuckets,
    )) {
      d.buckets.push(diff);
    }

    yield d;
    d = createProllyTreeDiff();
  }

  while (!lc.done()) {
    // if (lLeftovers.length > 0) {
    //   d.entries.push(...lLeftovers.map<EntryDiff>((e) => [e, null]));
    //   lLeftovers = [];
    // }

    // d.entries.push(
    //   ...lc.currentBucket().entries.map<EntryDiff>((e) => [e, null]),
    // );

    const lLastBuckets = lc.buckets();

    await lc.nextBucket(0);

    const lRemovedBuckets = Array.from(
      difference(lLastBuckets, lc.buckets(), compareBuckets),
    );

    if (lc.done()) {
      lRemovedBuckets.push(...lc.buckets());
    }

    for (const b of lRemovedBuckets) {
      d.buckets.push([b, null] as BucketDiff);
    }

    yield d;
    d = createProllyTreeDiff();
  }

  while (!rc.done()) {
    // if (rLeftovers.length > 0) {
    //   d.entries.push(...rLeftovers.map<EntryDiff>((e) => [null, e]));
    //   rLeftovers = [];
    // }

    // d.entries.push(
    //   ...rc.currentBucket().entries.map<EntryDiff>((e) => [null, e]),
    // );

    const rLastBuckets = rc.buckets();

    await rc.nextBucket(0);

    const rRemovedBuckets = Array.from(
      difference(rLastBuckets, rc.buckets(), compareBuckets),
    );

    if (rc.done()) {
      rRemovedBuckets.push(...rc.buckets());
    }

    for (const b of rRemovedBuckets) {
      d.buckets.push([null, b] as BucketDiff);
    }

    yield d;
    d = createProllyTreeDiff();
  }
}
