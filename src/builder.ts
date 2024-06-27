import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { Blockstore } from "interface-blockstore";
import { SyncMultihashHasher } from "multiformats";
import { isBoundaryNode } from "./boundaries";
import { TreeCodec } from "./codec";
import { compareNodes, compareTuples } from "./compare";
import {
  bucketOf,
  createCursorState,
  getIsHead,
  getIsTail,
  moveToNextBucket,
  moveToTupleOnLevel,
  rootLevelOf,
} from "./cursor";
import {
  BucketDiff,
  NodeDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff";
import { Bucket, Node, ProllyTree, Tuple } from "./interface";
import {
  createBucket,
  findFailure,
  lastElement,
  prefixWithLevel,
} from "./util";

type Ops = "rm" | "add";
export interface Update<Op extends Ops = Ops, Level extends number = number> {
  op: Op;
  level: Level;
  value: Op extends "add" ? Node : Tuple;
}

const compareNodeToUpdate = (a: Node, b: Update): number =>
  compareTuples(a, b.value);

const updateBucket = <Code extends number, Alg extends number>(
  bucket: Bucket<Code, Alg>,
  leftovers: Node[],
  updates: Update[],
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
  isHead: boolean,
): [Bucket<Code, Alg>[], Node[], NodeDiff[]] => {
  const buckets: Bucket<Code, Alg>[] = [];
  const afterbound: Node[] = [];
  const nodeDiffs: NodeDiff[] = [];

  const isBoundary = isBoundaryNode(bucket.prefix.average, bucket.prefix.level);

  const handleUpdate = (
    node: Node | null,
    update: Update,
  ): [Node | null, NodeDiff | null] => {
    if (update.op === "add") {
      const addedNode = update.value as Update<"add">["value"];
      if (node != null) {
        if (compareNodes(node, addedNode) !== 0) {
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
    }

    if (nodeDiff) nodeDiffs.push(nodeDiff);

    if (addedNode) {
      afterbound.push(addedNode);
      if (isBoundary(addedNode)) {
        buckets.push(
          createBucket(bucket.prefix, afterbound.splice(0), codec, hasher),
        );
      }
    }
  }

  if (isHead && leftovers.length > 0) {
    buckets.push(
      createBucket(bucket.prefix, leftovers.splice(0), codec, hasher),
    );
  }

  return [buckets, afterbound, nodeDiffs];
};

export async function* mutateTree<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  updates: Update<Ops, number>[],
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  let diffs = createProllyTreeDiff<Code, Alg>();

  const cursorState = createCursorState(blockstore, tree);

  const newRootFound = () =>
    newBuckets.length === 1 &&
    leftovers.length === 0 &&
    visitedLevelTail &&
    visitedLevelHead;

  let level: number = -1;
  let newBuckets: Bucket<Code, Alg>[] = [];
  let leftovers: Node[] = [];
  let visitedLevelTail: boolean = false;
  let visitedLevelHead: boolean = false;

  while (updates.length > 0 && !newRootFound()) {
    const firstBucketOfLevel: boolean = level !== updates[0].level;
    level = updates[0].level;

    if (firstBucketOfLevel) {
      newBuckets = [];
    }

    const pastRootLevel = level > rootLevelOf(cursorState);

    let updatee: Bucket<Code, Alg>;
    if (!pastRootLevel) {
      if (leftovers.length === 0) {
        await moveToTupleOnLevel(
          cursorState,
          updates[0].value,
          updates[0].level,
        );
      } else {
        await moveToNextBucket(cursorState);
      }

      updatee = bucketOf(cursorState);
      visitedLevelTail =
        visitedLevelHead || (firstBucketOfLevel && getIsTail(cursorState));
      visitedLevelHead = getIsHead(cursorState);
    } else {
      updatee = createBucket(
        prefixWithLevel(tree.root.prefix, level),
        [],
        tree.getCodec(),
        tree.getHasher(),
      );
      visitedLevelTail = true;
      visitedLevelHead = true;
    }

    const [buckets, afterbound, nodeDiffs] = updateBucket(
      updatee,
      leftovers,
      updates.splice(
        0,
        findFailure(
          updates,
          (u) => compareTuples(u.value, lastElement(updatee.nodes)) <= 0,
        ),
      ),
      tree.getCodec(),
      tree.getHasher(),
      visitedLevelHead,
    );
    newBuckets.push(...buckets);
    leftovers.push(...afterbound);

    // there were changes
    if (nodeDiffs.length > 0) {
      // track leaf node changes
      if (level === 0) {
        diffs.nodes.push(...nodeDiffs);
      }

      // only add updatee to removed if it existed
      if (!pastRootLevel) {
        diffs.buckets.push([updatee, null]);
      }
      diffs.buckets.push(
        ...buckets.map((b): BucketDiff<Code, Alg> => [null, b]),
      );

      updates.push(
        ...buckets.map(
          (b: Bucket<Code, Alg>): Update<"add"> => ({
            op: "add",
            level: level + 1,
            value: lastElement(b.nodes),
          }),
        ),
      );
    }

    if (buckets.length > 0) {
      const boundary = lastElement(lastElement(buckets).nodes);

      yield {
        // node diffs up to last bucket diff boundary
        nodes: diffs.nodes.splice(
          0,
          findFailure(
            diffs.nodes,
            (d) => compareTuples(d[0] ?? d[1], boundary) <= 0,
          ),
        ),
        // all bucket diffs
        buckets: diffs.buckets.splice(0, diffs.buckets.length),
      };
    }
  }

  tree.root = newBuckets[0];

  if (level < rootLevelOf(cursorState)) {
    // add all higher level buckets in path to removed
    diffs.buckets.push(
      ...cursorState.currentBuckets
        .slice(0, cursorState.currentBuckets.length - level)
        .map((b): BucketDiff<Code, Alg> => [b, null]),
    );
  }
  yield diffs;
}
