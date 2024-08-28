/**
 * implements efficient prolly-tree diff https://www.dolthub.com/blog/2020-06-16-efficient-diff-on-prolly-trees/
 * article by Aaron Son, June 16, 2020
 *
 * (code, comments) have been scraped from the article and turned into (typescript, jsdoc) format.
 *
 * Changes:
 *
 * - In the article, the cursor is always set to level 0. Starting on level 0 may require loading blocks other than root (which is already loaded as part of the tree instance).
 *   The FastForwardUntilEqual and GreatestMatchingLevelForPaths functions from the article have been replaced with ffwUnequalLevel0 and getMatchingBucketsLength, respectively.
 *   Like the original functions, they are able to forward the cursors to unequal points or done.
 *   Unlike the original functions from the article, they are able to handle equal or unequal (by compareTuples) cursors that are not on level 0.
 *
 * - Along with outputing the diffs of nodes the diff function below needs to output the diffs of buckets. This allows for bucket cids to be pinned and unpinned by any underlying blockstores or hosts.
 *   This feature required diverging from the article's implementation.
 */

import { ithElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { compareBucketHashes, compareNodes, compareTuples } from "./compare.js";
import { createCursor, type Cursor } from "./cursor.js";
import { Bucket, Node, ProllyTree } from "./interface.js";

type LeftDiff<T> = [T, null];
type RightDiff<T> = [null, T];
type LeftAndRightDiff<T> = [T, T];

const leftDiffer = <T>(value: T): LeftDiff<T> => [value, null];
const rightDiffer = <T>(value: T): RightDiff<T> => [null, value];

type Diff<T> = LeftDiff<T> | RightDiff<T> | LeftAndRightDiff<T>;

export type NodeDiff = Diff<Node>;
export type BucketDiff<Code extends number, Alg extends number> = Diff<
  Bucket<Code, Alg>
>;

export interface ProllyTreeDiff<Code extends number, Alg extends number> {
  nodes: NodeDiff[];
  buckets: BucketDiff<Code, Alg>[];
}

export const createProllyTreeDiff = <
  Code extends number,
  Alg extends number,
>(): ProllyTreeDiff<Code, Alg> => ({
  nodes: [],
  buckets: [],
});

const getBucketDiff = function* <Code extends number, Alg extends number>(
  firstCursor: Cursor<Code, Alg>,
  secondCursor: Cursor<Code, Alg>,
  last: { value: Bucket<Code, Alg>[] },
  differ: typeof leftDiffer | typeof rightDiffer,
): Iterable<BucketDiff<Code, Alg>> {
  let minuend: Bucket<Code, Alg>[];
  let subtrahend: Bucket<Code, Alg>[];
  if (!firstCursor.done()) {
    // compare last buckets with current buckets
    minuend = last.value;
    subtrahend = firstCursor.buckets();
  } else {
    // compare current buckets with second tree buckets
    minuend = firstCursor.buckets();
    subtrahend = secondCursor.buckets();
  }

  // low level buckets first
  minuend.slice().reverse();
  subtrahend.slice().reverse();

  let i = 0;

  const b: Diff<Bucket<Code, Alg>>[] = [];
  while (i < minuend.length) {
    // yield minued[i] if i out of subtrahend bounds or comparison is unequal
    if (
      // out of bounds will only occur when comparing buckets from first and second cursors, not last
      i >= subtrahend.length ||
      compareBucketHashes(ithElement(minuend, i), ithElement(subtrahend, i)) !==
        0
    ) {
      b.push(differ(ithElement(minuend, i)));
    }

    i++;
  }

  yield* b.reverse();
};

const getMatchingBucketsLength = <Code extends number, Alg extends number>(
  a: Bucket<Code, Alg>[],
  b: Bucket<Code, Alg>[],
): number => {
  // low level buckets first
  a = a.slice().reverse();
  b = b.slice().reverse();

  let i = 0;

  // increment i for every matching bucket from level 0
  while (i < a.length && i < b.length) {
    if (compareBucketHashes(ithElement(a, i), ithElement(b, i)) !== 0) {
      break;
    }

    i++;
  }

  return i;
};

async function ffwUnequalLevel0<Code extends number, Alg extends number>(
  lc: Cursor<Code, Alg>,
  rc: Cursor<Code, Alg>,
): Promise<void> {
  if (lc.level() !== rc.level()) {
    throw new Error("expected cursors to be same level");
  }

  // while both cursors are not done AND the level is not 0 or the comparison is 0
  // ensures that returned cursors are on level 0 and unequal OR one of the cursors is done
  while (!lc.done() && !rc.done()) {
    if (compareNodes(lc.current(), rc.current()) === 0) {
      // move to comparison that is non-equal or one or more cursors done
      const matchingBucketsLength = getMatchingBucketsLength(
        lc.buckets(),
        rc.buckets(),
      );
      const level = lc.level();
      // could be sped up by checking when the bucket will end
      // skip the matchingBucketsLength for every .nextAtLevel call
      await Promise.all([
        lc.nextAtLevel(matchingBucketsLength + level),
        rc.nextAtLevel(matchingBucketsLength + level),
      ]);
    } else {
      if (lc.level() === 0) {
        // unequal on level zero return
        return;
      } else {
        // unequal on level > zero, increment on level 0
        await Promise.all([lc.nextAtLevel(0), rc.nextAtLevel(0)]);
      }
    }
  }
}

export async function* diff<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  left: ProllyTree<Code, Alg>,
  right: ProllyTree<Code, Alg>,
  rightBlockstore?: Blockstore,
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  let d = createProllyTreeDiff<Code, Alg>();

  const lc: Cursor<Code, Alg> = createCursor(blockstore, left);
  const rc: Cursor<Code, Alg> = createCursor(
    rightBlockstore ?? blockstore,
    right,
  );

  // move higher cursor to level of lower cursor
  if (lc.level() > rc.level()) {
    await lc.nextAtLevel(rc.level());
  }
  if (rc.level() > lc.level()) {
    await rc.nextAtLevel(lc.level());
  }

  // moves cursors to level 0 or one or more cursors to done
  await ffwUnequalLevel0(lc, rc);

  let lastLeftBuckets = { value: lc.buckets() };
  let lastRightBuckets = { value: rc.buckets() };

  const getLeftBucketDiff = () =>
    getBucketDiff(lc, rc, lastLeftBuckets, leftDiffer);
  const getRightBucketDiff = () =>
    getBucketDiff(rc, lc, lastRightBuckets, rightDiffer);

  // handle empty buckets
  // can probably be generalized later
  d.buckets.push(...getLeftBucketDiff());
  d.buckets.push(...getRightBucketDiff());

  while (!lc.done() && !rc.done()) {
    const [lv, rv] = [lc.current(), rc.current()];
    const comparison = compareTuples(lv, rv);

    if (comparison < 0) {
      d.nodes.push(leftDiffer(lv));
      await lc.nextAtLevel(0);
    } else if (comparison > 0) {
      d.nodes.push(rightDiffer(rv));
      await rc.nextAtLevel(0);
    } else {
      throw new Error("should never be unequal due to ffwUnequalLevel0 call");
    }

    // may cause both cursor buckets to change so bucket diffs must be done after ffw
    await ffwUnequalLevel0(lc, rc);

    // would like to have these ordered in diff based on range start/end
    d.buckets.push(...getLeftBucketDiff(), ...getRightBucketDiff());

    lastLeftBuckets.value = lc.buckets();
    lastRightBuckets.value = rc.buckets();

    if (d.buckets.length > 0) {
      yield d;
      d = createProllyTreeDiff();
    }
  }

  while (!lc.done()) {
    d.nodes.push(leftDiffer(lc.current()));
    await lc.nextAtLevel(0);

    d.buckets.push(...getLeftBucketDiff());
    lastLeftBuckets.value = lc.buckets();

    if (d.buckets.length > 0) {
      yield d;
      d = createProllyTreeDiff();
    }
  }

  while (!rc.done()) {
    d.nodes.push(rightDiffer(rc.current()));
    await rc.nextAtLevel(0);

    d.buckets.push(...getRightBucketDiff());
    lastRightBuckets.value = rc.buckets();

    if (d.buckets.length > 0) {
      yield d;
      d = createProllyTreeDiff();
    }
  }
}
