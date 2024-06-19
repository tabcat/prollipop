import { Blockstore } from "interface-blockstore";
import { Bucket, createEmptyBucket } from "./bucket";
import {
  Tuple,
  DefaultNode,
  compareTuples,
  Node,
  findIndexGTE,
  compareNodes,
} from "./node";
import {
  bucketOf,
  getIsHead,
  createCursorState,
  moveToTupleOnLevel,
  rootLevelOf,
} from "./cursor";
import { NodeDiff, ProllyTreeDiff, createProllyTreeDiff, diff } from "./diff";
import { lastElement, prefixWithLevel } from "./util";
import { Diff, difference } from "@tabcat/ordered-sets/difference";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { intersection } from "@tabcat/ordered-sets/intersection";
import { union } from "@tabcat/ordered-sets/union";
import { isBoundaryNode } from "./boundaries";
import { ProllyTree } from "./tree";

type AddOp = [Node, "add"];
type RmOp = [Tuple, "rm"];
type Update = AddOp | RmOp;

const isAddOp = (u: Update): u is AddOp => u[1] === "add";
const isRmOp = (u: Update): u is RmOp => u[1] === "rm";

export const compareUpdates = (a: Update, b: Update): number => {
  const tuplesComparison = compareTuples(a[0], b[0]);

  if (tuplesComparison !== 0) {
    return tuplesComparison;
  }

  if (a[1] === b[1]) {
    return 0;
  }

  // move adds to the front
  if (a[1] === "add") {
    return -1;
  } else if (b[1] === "add") {
    return 1;
  } else {
    throw new Error("unrecognized builder op");
  }
};

const reduceUpdates = (updates: Update[]): Update[] => {
  const updatesIterator = updates[Symbol.iterator]();

  const firstUpdate = updatesIterator.next();

  if (firstUpdate.value == null) {
    return [];
  }

  const reducedUpdates: Update[] = [firstUpdate.value];

  for (const update of updatesIterator) {
    if (compareTuples(lastElement(reducedUpdates)[0], update[0]) !== 0) {
      reducedUpdates.push(update);
    }
  }

  return reducedUpdates;
};

const getUpdatesThisLevel = (updates: Update[]): Update[] => {
  const updatesIterator = updates[Symbol.iterator]();
  const firstUpdate = updatesIterator.next();

  let lastUpdate: Update = firstUpdate.value;
  const onLevel: Update[] = [lastUpdate];
  for (const update of updatesIterator) {
    // logic depends on there being a single update for a tuple
    if (compareTuples(lastUpdate[0], update[0]) >= 0) {
      break;
    }

    onLevel.push(lastUpdate);
  }

  return onLevel;
};

const getUpdatesInBoundary = <T, Code extends number, Alg extends number>(
  bucket: Bucket<Code, Alg>,
  updates: Update[],
): Update[] =>
  updates.splice(
    0,
    findIndexGTE(
      updates.map((u) => u[0]),
      lastElement(bucket.nodes),
    ),
  );

const updateBucket = <T, Code extends number, Alg extends number>(
  bucket: Bucket<Code, Alg>,
  updates: Update[],
  isTail: boolean,
): [Bucket<Code, Alg>[], Update[], NodeDiff] => {
  const { prefix } = bucket;

  const buckets: Bucket<Code, Alg>[] = [];
  const afterbound: Update[] = [];

  const removedNodes: Node[] = Array.from(
    intersection(
      bucket.nodes,
      updates.filter(isRmOp).map((u) => u[0]),
      compareTuples,
    ),
  );
  const addedNodes: Node[] = Array.from(
    difference(
      updates.filter(isAddOp).map((u) => u[0]),
      bucket.nodes,
      compareNodes,
    ),
  );
  const diff: Diff<Node>[] = Array.from(
    pairwiseTraversal(removedNodes, addedNodes, compareNodes),
  ).map(([a, b]): Diff<Node> => (a !== null ? [a, null] : [null, b]));

  const newNodes: Node[] = Array.from(
    union(
      intersection(bucket.nodes, removedNodes, compareNodes),
      addedNodes,
      compareNodes,
    ),
  );

  const boundaries: Node[][] = [];

  while (newNodes.findIndex((n) => isBoundaryNode) !== -1) {
    const foundIndex = newNodes.findIndex(
      isBoundaryNode(prefix.average, prefix.level),
    );
    boundaries.push(newNodes.splice(0, foundIndex + 1));
  }

  return [buckets, updates, diff];
};

export async function * mutateTree<T, Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<T, Code, Alg>,
  updates: Update[],
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  let diff: ProllyTreeDiff<Code, Alg> = createProllyTreeDiff()
  const cursorState = createCursorState(blockstore, tree.codec, tree.hasher, [
    tree.root,
  ]);

  // sort by tuple
  updates.sort(compareUpdates);
  // one update per tuple
  updates = reduceUpdates(updates);

  let level = 0;
  let firstBucketOfLevel = true;
  let levelTail: Bucket<Code, Alg> | null = null;
  let levelHead: Bucket<Code, Alg> | null = null;
  let newRoot: Bucket<Code, Alg> | null = null;

  while (updates.length > 0) {
    await moveToTupleOnLevel(cursorState, updates[0][0], level);

    if (firstBucketOfLevel && getIsHead(cursorState)) {
      levelTail = lastElement(cursorState.currentBuckets);
    }
    firstBucketOfLevel = false;

    if (getIsHead(cursorState)) {
      levelHead = lastElement(cursorState.currentBuckets);
    }

    const pastRoot = level > rootLevelOf(cursorState);

    const updatee: Bucket<Code, Alg> = pastRoot
      ? createEmptyBucket(
          prefixWithLevel(bucketOf(cursorState).prefix, level),
          tree.codec,
          tree.hasher,
        )
      : bucketOf(cursorState);

    const updatesInBoundary: Update[] = getUpdatesInBoundary(
      bucketOf(cursorState),
      getUpdatesThisLevel(updates),
    );

    /**
     * If buckets has multiple elements then atleast one boundary was added.
     * If afterbound has elements then the old boundary was removed.
     * If updatee is a levelHead then afterbound will be empty.
     */
    const [buckets, afterbound, nodeDiff]: [
      Bucket<Code, Alg>[],
      Update[],
      NodeDiff,
    ] = updateBucket(updatee, updatesInBoundary, Boolean(levelHead));

    // check if any updates resulted in changes to bucket
    if (nodeDiff.length > 0) {
      if (level === 0) {
        // track changed leaf nodes
        diff.nodes.push(...nodeDiff);
      }

      // only add to diff if bucket existed in tree before
      if (!pastRoot) {
        // rm old buckets in diff
        diff.buckets.push([updatee, null]);
        // remove bucket from parent
        updates.push([lastElement(updatee.nodes), "rm"]);
      }

      // add new buckets to diff
      diff.buckets.push(
        ...buckets.map<[null, Bucket<Code, Alg>]>((b) => [null, b]),
      );
      // add new buckets to parent
      updates.push(
        ...buckets.map<Update>((b) => {
          const { timestamp, hash } = lastElement(b.nodes);

          return [
            new DefaultNode(timestamp, hash, b.getHash(), tree.codec),
            "add",
          ];
        }),
      );

      // add afterbound updates back to front of updates
      updates.unshift(...afterbound);

      yield diff
      diff = createProllyTreeDiff()
    }

    // move to next level
    if (Boolean(levelHead)) {
      level++;
      firstBucketOfLevel = true;
      levelTail = null;
      levelHead = null;
    }

    // check if bucket[0] is new root
    if (
      newRoot === null &&
      buckets.length === 1 &&
      afterbound.length === 0 &&
      levelTail != null &&
      levelHead != null &&
      compareTuples(updatesInBoundary[0][0], lastElement(levelTail.nodes)) >= 0 // update tuples span the entire level
    ) {
      newRoot = buckets[0];
    }
  }

  if (newRoot == null) {
    throw new Error("something went wrong");
  } else {
    tree.root = newRoot;
  }
}
