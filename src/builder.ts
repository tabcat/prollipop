import { firstElement, ithElement } from "@tabcat/ith-element";
import { union } from "@tabcat/ordered-sets/union";
import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { Blockstore } from "interface-blockstore";
import { compare as compareBytes } from "uint8arrays";
import { isBoundaryNode } from "./boundaries.js";
import { compareBoundaries, compareBuckets, compareTuples } from "./compare.js";
import { createCursor } from "./cursor.js";
import {
  BucketDiff,
  NodeDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff.js";
import { Bucket, Node, ProllyTree, Tuple } from "./interface.js";
import { prefixWithLevel } from "./internal.js";
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
type LeveledUpdate = Update & { level: number };

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
  update: LeveledUpdate,
): [Node | null, NodeDiff | null] => {
  if (update.op === "add") {
    const addedNode = update.value;
    if (node != null) {
      if (compareBytes(node.message, addedNode.message) !== 0) {
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

  throw new TypeError(`Unrecognized Prollipop update operation: ${update['op']}`);
};

/**
 * Rebuilds the tree according to updates given and yields the different nodes and buckets.
 *
 * @param blockstore
 * @param tree
 * @param updates
 * @returns
 */
export async function* rebuild(
  blockstore: Blockstore,
  tree: ProllyTree,
  updates: Update[],
): AsyncGenerator<ProllyTreeDiff> {
  const updts: LeveledUpdate[] = updates.map((u) =>
    Object.assign(u, { level: 0 }),
  );

  if (updts.length === 0) {
    return;
  }

  let diff: ProllyTreeDiff = createProllyTreeDiff();
  let mutated: boolean = false;

  let newRoot: Bucket | null = null;

  const cursor = createCursor(blockstore, tree);
  await cursor.ffw(ithElement(updts, 0).value, 0);

  let updatee: Bucket = cursor.currentBucket();

  let nodes: Node[] = [];
  let bounds: Node[][] = [];
  let nodeDiffs: NodeDiff[] = [];
  let removedBuckets: Bucket[] = [];

  let firstBucketOfLevel: boolean = true;
  let bucketsOnLevel: number = 0;
  let visitedLevelTail: boolean = cursor.isAtTail();
  let visitedLevelHead: boolean = cursor.isAtHead();
  let pastRootLevel: boolean = false;

  let i: number = 0;
  while (updts.length > 0 && i < 10000) {
    i++;
    const { average, level } = updatee.prefix;
    const buckets: Bucket[] = [];
    const isBoundary = isBoundaryNode(average, level);

    let updatesProcessed = 0;
    for (const [node, updt, nodesDone] of pairwiseTraversal(
      updatee.nodes,
      updts,
      (a, b) => compareTuples(a, b.value),
    )) {
      let n: Node | null = null;
      let d: NodeDiff | null = null;

      if (updt == null) {
        n = node;
      } else {
        if (updt.level !== level || (nodesDone && !visitedLevelHead)) {
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
      buckets.push(createBucket(updatee.prefix, bound));
    }
    bucketsOnLevel += bounds.length;
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
      let u: LeveledUpdate | null = null;
      const bucketDiffs: BucketDiff[] = [];

      if (removed != null) {
        if (
          bucketsDone &&
          compareBytes(removed.getDigest(), updatee.getDigest()) !== 0
        ) {
          break;
        }

        bucketDiffs.push([removed, null]);

        const parentNode = removed.getParentNode();
        if (parentNode != null && level < cursor.rootLevel()) {
          u = { op: "rm", level: level + 1, value: parentNode };
        }

        removesProcessed++;
      }

      if (bucket != null && updated) {
        bucketDiffs.push([null, bucket]);

        const parentNode = bucket.getParentNode();
        if (parentNode != null) {
          u = { op: "add", level: level + 1, value: parentNode };
        }
      }

      u != null && updts.push(u);

      bucketDiffs.sort((a, b) => compareBuckets(a[0] ?? a[1], b[0] ?? b[1]));
      diff.buckets.push(...bucketDiffs);
    }
    removedBuckets.splice(0, removesProcessed);

    if (diff.buckets.length > 0 && buckets.length > 0) {
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

    const nextUpdt = updts[0];

    if (nextUpdt == null) {
      if (mutated) {
        break;
      }

      return tree;
    }

    pastRootLevel = nextUpdt.level > cursor.rootLevel();
    firstBucketOfLevel = nextUpdt.level > level;
    if (firstBucketOfLevel) {
      bucketsOnLevel = 0;
      visitedLevelHead = false;
      visitedLevelTail = false;
    }

    // reassign updatee
    if (!pastRootLevel) {
      if (bounds.length === 0) {
        await cursor.ffw(nextUpdt.value, nextUpdt.level);
      } else {
        await cursor.nextBucket();
      }

      updatee = cursor.currentBucket();
      visitedLevelTail =
        visitedLevelTail || (firstBucketOfLevel && cursor.isAtTail());
      visitedLevelHead = cursor.isAtHead();
    } else {
      updatee = createBucket(prefixWithLevel(tree.root.prefix, level + 1), []);
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
