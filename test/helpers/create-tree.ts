import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { SyncMultihashHasher } from "multiformats";
import { isBoundaryNode } from "../../src/boundaries.js";
import { TreeCodec, encodeBucket } from "../../src/codec.js";
import {
  DefaultBucket,
  DefaultNode,
  DefaultProllyTree,
} from "../../src/impls.js";
import type { Bucket, Node, Prefix, ProllyTree } from "../../src/interface.js";
import { prefixWithLevel } from "../../src/utils.js";

const levelOfNodes = <Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  nodes: Node[],
): Node[][] => {
  const level: Node[][] = [[]];
  for (const node of nodes) {
    lastElement(level).push(
      new DefaultNode(node.timestamp, node.hash, node.message),
    );

    if (isBoundaryNode(prefix.average, prefix.level)(node)) {
      level.push([]);
    }
  }

  if (lastElement(level).length === 0) {
    level.pop();
  }

  return level;
};

const levelOfBuckets = <Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  nodeLevel: Node[][],
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg>[] => {
  if (nodeLevel.length === 0) {
    nodeLevel.push([]);
  }

  return nodeLevel.map((nodes) => {
    const bytes = encodeBucket(prefix, nodes, codec);
    return new DefaultBucket(prefix, nodes, bytes, hasher.digest(bytes).digest);
  });
};

const nextLevelNodes = <Code extends number, Alg extends number>(
  buckets: Bucket<Code, Alg>[],
): Node[] => {
  const nodes: Node[] = [];
  for (const bucket of buckets) {
    nodes.push({ ...lastElement(bucket.nodes), message: bucket.getHash() });
  }
  return nodes;
};

export const createProllyTree = <Code extends number, Alg extends number>(
  blockstore: Blockstore,
  prefix: Prefix<Code, Alg>,
  nodes: Node[],
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>,
): [ProllyTree<Code, Alg>, Bucket<Code, Alg>[][]] => {
  let level: number = 0;
  let nodeLevel = levelOfNodes(prefix, nodes);
  let bucketLevel = levelOfBuckets(
    prefixWithLevel(prefix, level),
    nodeLevel,
    codec,
    hasher,
  );
  bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));

  const treeState: Bucket<Code, Alg>[][] = [bucketLevel];

  // tree has higher levels
  while (bucketLevel.length > 1) {
    if (level >= 4) {
      throw new Error("e");
    }
    level++;
    nodeLevel = levelOfNodes(
      prefixWithLevel(prefix, level),
      nextLevelNodes(bucketLevel),
    );
    bucketLevel = levelOfBuckets(
      prefixWithLevel(prefix, level),
      nodeLevel,
      codec,
      hasher,
    );
    bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));
    treeState.push(bucketLevel);
  }

  return [
    new DefaultProllyTree(firstElement(bucketLevel), codec, hasher),
    treeState.reverse(),
  ];
};

export const createProllyTreeNodes = <Alg extends number>(
  ids: number[],
  hasher: SyncMultihashHasher<Alg>,
): Node[] =>
  ids.map((id) => {
    const hash = hasher.digest(new Uint8Array(Array(id).fill(id))).digest;
    return new DefaultNode(id, hash, hash);
  });
