import { firstElement, lastElement } from "@tabcat/ith-element";
import { union } from "@tabcat/ordered-sets/union";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { Blockstore } from "interface-blockstore";
import { compare as compareBytes } from "uint8arrays";
import { createIsBoundary } from "./boundary.js";
import {
  compareBoundaries,
  compareBucketDiffs,
  compareBuckets,
  compareTuples,
} from "./compare.js";
import { createCursor } from "./cursor.js";
import {
  BucketDiff,
  NodeDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff.js";
import { DefaultNode } from "./impls.js";
import { Bucket, Node, ProllyTree, Tuple } from "./interface.js";
import { AwaitIterable, createBucket, nodeToTuple } from "./utils.js";

/**
 * An update is made of a Tuple, a Node, or a Node with a `strict: true` property.
 * Tuples will result in a remove.
 * Nodes will result in an add.
 * Nodes with a `strict: true` property will result in a remove only if the given node and the node found in the tree match.
 */
export type Update = Tuple | Node | (Node & { strict: true });

/**
 * Takes a node and update of equal tuples and returns whether a change must be made.
 * The node may be null but the update will always be defined.
 *
 * @param node
 * @param update
 * @returns
 */
const handleUpdate = (
  node: Node | null,
  update: Update,
): [Node | null, NodeDiff | null] => {
  if ("message" in update) {
    const updateNode = new DefaultNode(update.seq, update.key, update.val);

    if (node != null) {
      if (compareBytes(node.val, update.val) === 0) {
        if ("strict" in update) {
          return [null, [node, null]];
        } else {
          return [node, null];
        }
      } else {
        if ("strict" in update) {
          return [node, null];
        } else {
          return [updateNode, [node, updateNode]];
        }
      }
    } else {
      return [updateNode, [null, updateNode]];
    }
  } else {
    if (node != null) {
      return [null, [node, null]];
    } else {
      return [null, null];
    }
  }
};

async function takeOneUpdate(
  updates: AwaitIterable<Update | Update[]>,
): Promise<Update | void> {
  for await (const u of updates) return Array.isArray(u) ? u[0] : u;
}

async function populateUpdts(
  updates: AwaitIterable<Update | Update[]>,
  updts: Update[],
  updatee: Bucket,
  isHead: boolean,
): Promise<void> {
  for await (let _updates of updates) {
    if (!Array.isArray(_updates)) {
      _updates = [_updates];
    }

    for (const u of _updates) {
      updts.push(u);
    }

    const boundary = updatee.getBoundary();
    if (
      boundary != null &&
      !isHead &&
      compareTuples(lastElement(updts), boundary) >= 0
    ) {
      break;
    }
  }
}

/**
 * Mutates the tree according to updates given and yields the different nodes and buckets.
 * The updates parameter MUST yield non-repeating (per tuple), ordered nodes (to add) or tuples (to remove).
 *
 * @param blockstore
 * @param tree
 * @param updates
 * @returns
 */
export async function* mutate(
  blockstore: Blockstore,
  tree: ProllyTree,
  updates: AwaitIterable<Update | Update[]>,
): AsyncGenerator<ProllyTreeDiff> {
  // whole function should be rewritten around updates async iterator, too complicated right now
  if (Array.isArray(updates)) {
    updates = updates[Symbol.iterator]();
  }

  const firstUpdate = await takeOneUpdate(updates);

  if (firstUpdate == null) {
    return tree;
  }

  let diff: ProllyTreeDiff = createProllyTreeDiff();
  let mutated: boolean = false;

  let newRoot: Bucket | null = null;

  const cursor = createCursor(blockstore, tree);
  await cursor.jumpTo(firstUpdate, 0);

  let updatee: Bucket = cursor.currentBucket();

  let nodes: Node[] = [];
  let bounds: Node[][] = [];
  let nodeDiffs: NodeDiff[] = [];
  let removedBuckets: Bucket[] = [];

  let updts: Update[] = [firstUpdate];
  let updtsNextLevel: Update[] = [];

  let firstBucketOfLevel: boolean = true;
  let bucketsOnLevel: number = 0;
  let visitedLevelTail: boolean = cursor.isAtTail();
  let visitedLevelHead: boolean = cursor.isAtHead();
  let pastRootLevel: boolean = false;

  let i: number = 0;
  while (updts.length > 0 && i < 10000) {
    i++;
    const { average, level } = updatee;
    const buckets: Bucket[] = [];
    const isBoundary = createIsBoundary(average, level);

    if (level === 0) {
      await populateUpdts(updates, updts, updatee, visitedLevelHead);
    }

    let updatesProcessed = 0;
    for (const [node, updt, nodesDone] of pairwiseTraversal(
      updatee.entries,
      updts,
      compareTuples,
    )) {
      let n: Node | null = null;
      let d: NodeDiff | null = null;

      if (updt == null) {
        n = node;
      } else {
        if (nodesDone && !visitedLevelHead) {
          break;
        }

        [n, d] = handleUpdate(node, updt);
        updatesProcessed++;
      }

      if (n != null) {
        nodes.push(n);

        if (isBoundary(n)) {
          bounds.push(nodes);
          nodes = [];
        }
      }

      if (d != null && level === 0) {
        nodeDiffs.push(d);
      }
    }
    updts.splice(0, updatesProcessed);

    if (visitedLevelHead && (bounds.length === 0 || nodes.length > 0)) {
      bounds.push(nodes);
      nodes = [];
    }

    for (const bound of bounds) {
      buckets.push(createBucket(average, level, bound));
    }
    bucketsOnLevel += buckets.length;
    bounds = [];

    const newRootFound =
      bucketsOnLevel === 1 &&
      nodes.length === 0 &&
      visitedLevelTail &&
      visitedLevelHead;

    const updated =
      buckets.length === 0 ||
      compareBytes(buckets[0]!.getDigest(), updatee.getDigest()) !== 0;

    if (updated && level === 0) {
      mutated = true;
      removedBuckets = Array.from(
        union(removedBuckets, cursor.buckets().reverse(), compareBuckets),
      );
    }

    let removesProcessed = 0;
    for (const [bucket, removed, bucketsDone] of pairwiseTraversal(
      buckets,
      removedBuckets,
      compareBoundaries,
    )) {
      let u: Update | null = null;

      if (removed != null) {
        if (
          bucketsDone &&
          compareBytes(removed.getDigest(), updatee.getDigest()) !== 0
        ) {
          break;
        }

        diff.buckets.push([removed, null]);

        const parentNode = removed.getParentNode();
        if (parentNode != null && level < cursor.rootLevel()) {
          u = nodeToTuple(parentNode);
        }

        removesProcessed++;
      }

      if (bucket != null && updated) {
        diff.buckets.push([null, bucket]);

        const parentNode = bucket.getParentNode();
        if (parentNode != null) {
          u = parentNode;
        }
      }

      u != null && updtsNextLevel.push(u);
    }
    removedBuckets.splice(0, removesProcessed);

    if (diff.buckets.length > 0 && buckets.length > 0 && nodes.length === 0) {
      diff.buckets.sort(compareBucketDiffs);
      diff.nodes.push(...nodeDiffs);
      nodeDiffs = [];

      yield diff;
      diff = createProllyTreeDiff();
    }

    if (newRootFound) {
      newRoot = firstElement(buckets);
      updts.length = 0;
      break;
    }

    let nextUpdt = updts[0] ?? (await takeOneUpdate(updates));
    let nextLevel = level;

    if (nextUpdt == null) {
      if (updtsNextLevel.length > 0) {
        updts = updtsNextLevel;
        updts.sort(compareTuples);
        updtsNextLevel = [];
        nextUpdt = firstElement(updts);
        nextLevel += 1;
      } else {
        if (mutated) {
          break;
        }

        return tree;
      }
    } else {
      updts[0] = nextUpdt;
    }

    pastRootLevel = nextLevel > cursor.rootLevel();
    firstBucketOfLevel = nextLevel > level;
    if (firstBucketOfLevel) {
      bucketsOnLevel = 0;
      visitedLevelHead = false;
      visitedLevelTail = false;
    }

    // reassign updatee
    if (!pastRootLevel) {
      if (bounds.length === 0) {
        await cursor.jumpTo(nextUpdt, nextLevel);
      } else {
        await cursor.nextBucket();
      }

      updatee = cursor.currentBucket();
      visitedLevelTail =
        visitedLevelTail || (firstBucketOfLevel && cursor.isAtTail());
      visitedLevelHead = cursor.isAtHead();
    } else {
      updatee = createBucket(average, level + 1, []);
      visitedLevelTail = true;
      visitedLevelHead = true;
    }
  }

  if (newRoot == null) {
    throw new Error(
      `Processed all updates without finding a new root.
This is a bug, please create an issue at https://github.com/tabcat/prollipop/issues`,
    );
  }

  if (removedBuckets.length > 0) {
    diff.buckets.push(...removedBuckets.map<BucketDiff>((b) => [b, null]));
    yield diff;
  }

  tree.root = newRoot;
}
