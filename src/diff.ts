/**
 * implements efficient prolly-tree diff https://www.dolthub.com/blog/2020-06-16-efficient-diff-on-prolly-trees/
 * article by Aaron Son, June 16, 2020
 *
 * (code, comments) have been scraped from the article and turned into (typescript, jsdoc) format.
 */

import type { CID } from "multiformats/cid";
import type { Cursor } from "./cursor";
import { type Node, compareTuples } from "./node";
import { toReversed } from "./util";

/**
 * Advances left and right cursors until one of them is done or they are no longer equal.
 * Postcondition:
 *   left.done() || right.done() ||
 *   compareTuples(left.current(), right.current()) !== 0
 *
 */
async function fastForwardUntilUnequal(
  left: Cursor,
  right: Cursor
): Promise<void> {
  while (!left.done() && !right.done()) {
    if (compareTuples(left.current(), right.current()) !== 0) {
      return;
    }

    const level = greatestMatchingLevelForPaths(left.path(), right.path());

    await Promise.all([
      left.nextAtLevel(level + 1),
      right.nextAtLevel(level + 1),
    ]);
  }
}

/**
 * Returns the highest level in the tree at which the provided paths match.
 * Returns -1 if there is no chunk address that matches, 0 if only the last
 * chunk address in each path matches, etc.
 *
 * @param left - path from root to leaf bucket
 * @param right - path from root to leaf bucket
 * @returns
 */
function greatestMatchingLevelForPaths(left: CID[], right: CID[]): number {
  let level = -1;
  let li = left.length - 1;
  let ri = right.length - 1;

  while (li >= 0 && ri >= 0) {
    if (!left[li].equals(right[ri])) {
      break;
    }

    li--;
    ri--;
    level++;
  }

  return level;
}

type LeftDiff<T> = [T, null];
type RightDiff<T> = [null, T];

const leftDiffer = (cid: CID): LeftDiff<CID> => [cid, null];
const rightDiffer = (cid: CID): RightDiff<CID> => [null, cid];

type Diff<T> = LeftDiff<T> | RightDiff<T>;

export interface ProllyTreeDiff {
  nodes: Diff<Node>[];
  buckets: Diff<CID>[];
}

const createProllyTreeDiff = (): ProllyTreeDiff => ({
  nodes: [],
  buckets: [],
});

const getBucketDiff = <T extends LeftDiff<CID> | RightDiff<CID>>(
  last: CID[],
  current: CID[],
  differ: (cid: CID) => T
): T[] =>
  last
    .slice(
      -greatestMatchingLevelForPaths(toReversed(last), toReversed(current)) - 1
    )
    .map(differ);

export async function diff(
  left: Cursor,
  right: Cursor
): Promise<ProllyTreeDiff> {
  let d = createProllyTreeDiff();
  let lastLeftPath: CID[];
  let lastRightPath: CID[];

  // i've written this in ordered-sets, just have to generalize again
  while (!left.done() && !right.done()) {
    const [lv, rv] = [left.current(), right.current()];

    if (compareTuples(lv, rv) > 0) {
      // add node to diff
      d.nodes.push([lv, null]);

      // add buckets to diff
      lastLeftPath = left.path();
      await left.next();
      d.buckets.push(...getBucketDiff(lastLeftPath, left.path(), leftDiffer))
    } else if (compareTuples(lv, rv) < 0) {
      // add node to diff
      d.nodes.push([null, rv]);

      // add buckets to diff
      lastRightPath = right.path();
      await right.next();
      d.buckets.push(...getBucketDiff(lastRightPath, right.path(), rightDiffer))
    } else {
      await fastForwardUntilUnequal(left, right);
    }
  }

  while (!left.done()) {
    // add node to diff
    d.nodes.push([left.current(), null]);

    // add buckets to diff
    lastLeftPath = left.path();
    await left.next();
    d.buckets.push(...getBucketDiff(lastLeftPath, left.path(), leftDiffer))
  }

  while (!right.done()) {
    d.nodes.push([null, right.current()]);

    // add buckets to diff
    lastRightPath = right.path();
    await right.next();
    d.buckets.push(...getBucketDiff(lastRightPath, right.path(), rightDiffer))
  }

  return d;
}
