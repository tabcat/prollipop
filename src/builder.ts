import { firstElement, lastElement } from "@tabcat/ith-element";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { Blockstore } from "interface-blockstore";
import { compare } from "uint8arrays";
import { isBoundaryNode } from "./boundaries.js";
import { compareTuples, compareUpdates } from "./compare.js";
import { createCursor } from "./cursor.js";
import {
  BucketDiff,
  NodeDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff.js";
import { DefaultNode } from "./impls.js";
import { Bucket, Node, ProllyTree, Tuple } from "./interface.js";
import { findFailure, prefixWithLevel } from "./internal.js";
import { createBucket } from "./utils.js";

export interface AddUpdate {
  op: "add";
  value: Node;
}
export interface RmUpdate {
  op: "rm";
  value: Tuple;
}
export type Update = AddUpdate | RmUpdate;
export type LeveledUpdate = Update & { level: number };

const compareNodeToUpdate = (a: Node, b: LeveledUpdate): number =>
  compareTuples(a, b.value);

const compareLeveledUpdates = (a: LeveledUpdate, b: LeveledUpdate) => {
  if (a.level !== b.level) {
    return a.level - b.level;
  }

  return compareUpdates(a, b);
};

/**
 * Takes a node and update of equal tuples and returns whether a change must be made.
 * The node may be null but the update will always be defined.
 *
 * @param node
 * @param update
 * @returns
 */
export const handleUpdate = (
  node: Node | null,
  update: LeveledUpdate,
): [Node | null, NodeDiff | null] => {
  if (update.op === "add") {
    const addedNode = update.value;
    if (node != null) {
      if (compare(node.message, addedNode.message) !== 0) {
        return [addedNode, [node, addedNode]];
      } else {
        return [node, null];
      }
    } else {
      return [addedNode, [null, addedNode]];
    }
  }

  if (update.op === "rm") {
    if (node != null) {
      return [null, [node, null]];
    } else {
      return [null, null];
    }
  }

  throw new Error("unrecognized op");
};

/**
 * Helper function to create new buckets. Eases rebuilding of the tree from the updates.
 *
 * @param bucket - The bucket to be updated.
 * @param leftovers - Nodes which could not be included within the previous bucket's boundary.
 * @param updates - Updates to make to the bucket.
 * @param codec - Codec to use for encoding/decoding buckets and nodes.
 * @param hasher - Hasher to use to find the hash of the bucket.
 * @param isHead - Tells the function whether the bucket being updated is the level head.
 * @returns
 */
export const updateBucket = (
  bucket: Bucket,
  leftovers: Node[],
  updates: LeveledUpdate[],
  isHead: boolean,
): [Bucket[], Node[], NodeDiff[]] => {
  const buckets: Bucket[] = [];
  const nodeDiffs: NodeDiff[] = [];

  let afterbound: Node[] = [];

  const isBoundary = isBoundaryNode(bucket.prefix.average, bucket.prefix.level);

  for (const [node, update] of pairwiseTraversal(
    [...leftovers, ...bucket.nodes],
    updates,
    compareNodeToUpdate,
  )) {
    let addedNode: Node | null = null;
    let nodeDiff: NodeDiff | null = null;

    if (update == null) {
      addedNode = node;
    } else {
      [addedNode, nodeDiff] = handleUpdate(node, update);
      nodeDiff && nodeDiffs.push(nodeDiff);
    }

    if (addedNode) {
      afterbound.push(addedNode);
      if (isBoundary(addedNode)) {
        buckets.push(createBucket(bucket.prefix, afterbound));
        afterbound = [];
      }
    }
  }

  // handle empty bucket
  if (isHead && (afterbound.length > 0 || buckets.length === 0)) {
    buckets.push(createBucket(bucket.prefix, afterbound));
    afterbound = [];
  }

  return [buckets, afterbound, nodeDiffs];
};

export const bucketToParentNode = (bucket: Bucket): Node => {
  const { timestamp, hash } = bucket.getBoundary()!
  return new DefaultNode(timestamp, hash, bucket.getHash());
};

/**
 * Mutate a prolly-tree with updates.
 * Instead of rebuilding a tree from a complete list of leaf nodes, this function will edit and update buckets all the way to root.
 *
 * @param blockstore
 * @param tree
 * @param updates
 */
export async function* mutateTree(
  blockstore: Blockstore,
  tree: ProllyTree,
  updates: Update[],
): AsyncIterable<ProllyTreeDiff> {
  if (updates.length === 0) {
    return;
  }

  let diff = createProllyTreeDiff();

  // helper code so that created empty trees are found
  await blockstore.put(tree.root.getCID(), tree.root.getBytes());

  const cursor = createCursor(blockstore, tree);

  const updts: LeveledUpdate[] = updates.map((u) =>
    Object.assign(u, { level: 0 }),
  );

  let level: number = -1; // start at -1 to init firstBucketOfLevel
  let bucketsOnLevel: number = 0;
  let leftovers: Node[] = [];
  let visitedLevelTail: boolean = false;
  let visitedLevelHead: boolean = false;

  let newRoot: Bucket | null = null;
  let i = 0;

  while (updts.length > 0 && i < 100) {
    i++;
    const updtLevel = firstElement(updts).level;

    const firstBucketOfLevel: boolean = level !== updtLevel;
    level = updtLevel;

    if (firstBucketOfLevel) {
      bucketsOnLevel = 0;
    }

    const pastRootLevel = level > cursor.rootLevel();

    let updatee: Bucket;
    if (!pastRootLevel) {
      if (leftovers.length === 0) {
        await cursor.ffw(firstElement(updts).value, firstElement(updts).level);
      } else {
        await cursor.nextBucket();
      }

      updatee = cursor.currentBucket();
      visitedLevelTail =
        visitedLevelTail || (firstBucketOfLevel && cursor.isAtTail());
      visitedLevelHead = cursor.isAtHead();
    } else {
      updatee = createBucket(prefixWithLevel(tree.root.prefix, level), []);
      visitedLevelTail = true;
      visitedLevelHead = true;
    }

    const updtBatch = updts.splice(
      0,
      findFailure(
        updts,
        updatee.nodes.length > 0 && !visitedLevelHead
          ? (u) =>
              compareTuples(u.value, updatee.getBoundary()!) <= 0 &&
              u.level <= level
          : (u) => u.level <= level,
      ),
    );

    const [buckets, afterbound, nodeDiffs] = updateBucket(
      updatee,
      leftovers,
      updtBatch,
      visitedLevelHead,
    );
    bucketsOnLevel += buckets.length;
    leftovers = afterbound;

    // there were changes
    if (nodeDiffs.length > 0) {
      // track leaf node changes
      if (level === 0) {
        diff.nodes.push(...nodeDiffs);
      }

      // only add updatee to removed if it existed
      if (!pastRootLevel) {
        diff.buckets.push([updatee, null]);
      }
      // always add any new buckets to diff
      diff.buckets.push(...buckets.map((b): BucketDiff => [null, b]));
    }

    // only yield a diff if there are new buckets
    if (diff.buckets.length > 0 && buckets.length > 0) {
      // needs to be cleaned up later, empty buckets will be common. too many conditionals
      const boundary: Node | null = lastElement(buckets).getBoundary()

      yield {
        // node diffs up to last bucket diff boundary
        // afterbound updates have been applied but not commited to a bucket
        nodes: diff.nodes.splice(
          0,
          findFailure(
            diff.nodes,
            boundary != null && !visitedLevelHead
              ? (d) => compareTuples(d[0] ?? d[1], boundary) <= 0
              : () => true,
          ),
        ),
        // all bucket diffs
        buckets: diff.buckets,
      };
      diff.buckets = [];
    }

    const newRootFound =
      bucketsOnLevel === 1 &&
      leftovers.length === 0 &&
      visitedLevelTail &&
      visitedLevelHead;

    if (newRootFound) {
      newRoot = firstElement(buckets);
      updts.length = 0;
      // if (updts.length > 0) {
      //   throw new Error("whoa, why are there still updates?");
      // }
    } else {
      // add bucket update for next level
      updts.push(
        ...buckets.map(
          (b: Bucket): LeveledUpdate => ({
            op: "add",
            level: level + 1,
            value: bucketToParentNode(b),
          }),
        ),
      );

      // rm old bucket from parent
      if (nodeDiffs.length > 0 && updatee.nodes.length > 0) {
        updts.push({
          op: "rm",
          level: level + 1,
          value: updatee.getBoundary()!,
        });
      }

      updts.sort(compareLeveledUpdates);
    }
  }

  if (newRoot == null) {
    throw new Error("no new root found");
  }

  // add all higher level buckets in path to removed
  if (level < cursor.rootLevel()) {
    diff.buckets.push(
      ...cursor
        .buckets()
        .slice(0, cursor.buckets().length - 1 + level) // should always be level 0 so
        .map((b): BucketDiff => [b, null])
        .reverse(),
    );
  }

  if (diff.buckets.length > 0) yield diff;

  tree.root = newRoot;
}
