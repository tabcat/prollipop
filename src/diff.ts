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

import {
  Diff,
  ExclusiveDiff,
  diff as orderedDiff,
} from "@tabcat/ordered-sets/difference";
import { union } from "@tabcat/ordered-sets/union";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { Blockstore } from "interface-blockstore";
import {
  compareBucketDiffs,
  compareBucketDigests,
  compareBuckets,
  compareBytes,
  compareNodes,
  compareTuples,
} from "./compare.js";
import { createCursor, type Cursor } from "./cursor.js";
import { Bucket, Node, ProllyTree } from "./interface.js";

export type NodeDiff = Diff<Node>;
export type BucketDiff = ExclusiveDiff<Bucket>;

export interface ProllyTreeDiff {
  nodes: NodeDiff[];
  buckets: BucketDiff[];
}

/**
 * Create an empty prolly-tree diff
 *
 * @returns
 */
export const createProllyTreeDiff = (): ProllyTreeDiff => ({
  nodes: [],
  buckets: [],
});

async function ffwUnequalLevel0(lc: Cursor, rc: Cursor): Promise<void> {
  if (lc.level() !== rc.level()) {
    throw new Error("expected cursors to be same level");
  }

  // while both cursors are not done AND the level is not 0 or the comparison is 0
  // ensures that returned cursors are on level 0 and unequal OR one of the cursors is done
  while (!lc.done() && !rc.done()) {
    if (compareNodes(lc.current(), rc.current()) === 0) {
      // move to comparison that is non-equal or one or more cursors done
      let matchingBucketsLength = 0;
      for (const [lb, rb] of pairwiseTraversal(
        lc.buckets().reverse(),
        rc.buckets().reverse(),
        compareBucketDigests,
      )) {
        if (lb == null || rb == null) {
          break;
        }

        matchingBucketsLength++;
      }

      const level = lc.level();

      // could be sped up by checking when the bucket will end
      // skip the matchingBucketsLength for every .next call
      await Promise.all([
        lc.next(matchingBucketsLength + level),
        rc.next(matchingBucketsLength + level),
      ]);
    } else {
      if (lc.level() === 0) {
        // unequal on level zero return
        return;
      } else {
        // unequal on level > zero, increment on level 0
        await Promise.all([lc.next(0), rc.next(0)]);
      }
    }
  }
}

/**
 * Yields the diff of two trees.
 * A separate blockstore can be provided for fetching the blocks of each tree.
 * Diffs of nodes and buckets will be yielded in a deterministic order.
 *
 * @param blockstore
 * @param left
 * @param right
 * @param rightBlockstore
 */
export async function* diff(
  blockstore: Blockstore,
  left: ProllyTree,
  right: ProllyTree,
  rightBlockstore?: Blockstore,
): AsyncIterable<ProllyTreeDiff> {
  let d = createProllyTreeDiff();

  const lc: Cursor = createCursor(blockstore, left);
  const rc: Cursor = createCursor(rightBlockstore ?? blockstore, right);

  // move higher cursor to level of lower cursor
  if (lc.level() > rc.level()) {
    await lc.next(rc.level());
  }
  if (rc.level() > lc.level()) {
    await rc.next(lc.level());
  }

  // moves cursors to level 0 or one or more cursors to done
  await ffwUnequalLevel0(lc, rc);

  let bucketDiffs: BucketDiff[] = [];

  const updateBucketDiffs = (lbs: Bucket[], rbs: Bucket[]) => {
    // sort by level
    lbs.reverse();
    rbs.reverse();

    bucketDiffs = Array.from(
      union(
        bucketDiffs,
        orderedDiff(lbs, rbs, compareBuckets),
        compareBucketDiffs,
      ),
    );

    let i = 0;
    for (const diff of bucketDiffs) {
      if (
        diff[0] != null &&
        lbs[0] != null &&
        compareBuckets(lbs[0], diff[0]) >= 0
      ) {
        break;
      }

      if (
        diff[1] != null &&
        rbs[0] != null &&
        compareBuckets(rbs[0], diff[1]) >= 0
      ) {
        break;
      }

      d.buckets.push(diff);
      i++;
    }
    bucketDiffs.splice(0, i);
  };

  updateBucketDiffs(lc.buckets(), rc.buckets());

  while (!lc.done() && !rc.done()) {
    const [lv, rv] = [lc.current(), rc.current()];
    const comparison = compareTuples(lv, rv);

    if (comparison < 0) {
      d.nodes.push([lv, null]);
      await lc.next(0);
    } else if (comparison > 0) {
      d.nodes.push([null, rv]);
      await rc.next(0);
    } else {
      if (compareBytes(lv.val, rv.val) !== 0) {
        d.nodes.push([lv, rv]);
        await Promise.all([lc.next(0), rc.next(0)]);
      } else {
        // may cause both cursor buckets to change so bucket diffs must be done after ffw
        await ffwUnequalLevel0(lc, rc);
      }
    }

    updateBucketDiffs(lc.buckets(), rc.buckets());

    if (d.buckets.length > 0) {
      yield d;
      d = createProllyTreeDiff();
    }
  }

  while (!lc.done()) {
    d.nodes.push([lc.current(), null]);
    await lc.next(0);

    updateBucketDiffs(lc.buckets(), []);

    if (d.buckets.length > 0) {
      yield d;
      d = createProllyTreeDiff();
    }
  }

  while (!rc.done()) {
    d.nodes.push([null, rc.current()]);
    await rc.next(0);

    updateBucketDiffs([], rc.buckets());

    if (d.buckets.length > 0) {
      yield d;
      d = createProllyTreeDiff();
    }
  }

  if (bucketDiffs.length) {
    d.buckets.push(...bucketDiffs);
    yield d;
  }
}
