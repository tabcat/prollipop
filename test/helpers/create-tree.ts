import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { isBoundaryNode } from "../../src/boundaries.js";
import { encodeBucket, hasher } from "../../src/codec.js";
import {
  DefaultBucket,
  DefaultNode,
  DefaultProllyTree,
} from "../../src/impls.js";
import type { Bucket, Node, Prefix, ProllyTree } from "../../src/interface.js";
import { prefixWithLevel } from "../../src/internal.js";

const levelOfNodes = (prefix: Prefix, nodes: Node[]): Node[][] => {
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

const levelOfBuckets = (prefix: Prefix, nodeLevel: Node[][]): Bucket[] => {
  if (nodeLevel.length === 0) {
    nodeLevel.push([]);
  }

  return nodeLevel.map((nodes) => {
    const bytes = encodeBucket(prefix, nodes);
    return new DefaultBucket(prefix, nodes, bytes, hasher.digest(bytes).digest);
  });
};

const nextLevelNodes = (buckets: Bucket[]): Node[] => {
  const nodes: Node[] = [];
  for (const bucket of buckets) {
    nodes.push({ ...lastElement(bucket.nodes), message: bucket.getHash() });
  }
  return nodes;
};

export const createProllyTree = (
  blockstore: Blockstore,
  prefix: Prefix,
  nodes: Node[],
): [ProllyTree, Bucket[][]] => {
  let level: number = 0;
  let nodeLevel = levelOfNodes(prefix, nodes);
  let bucketLevel = levelOfBuckets(prefixWithLevel(prefix, level), nodeLevel);
  bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));

  const treeState: Bucket[][] = [bucketLevel];

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
    bucketLevel = levelOfBuckets(prefixWithLevel(prefix, level), nodeLevel);
    bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));
    treeState.push(bucketLevel);
  }

  return [
    new DefaultProllyTree(firstElement(bucketLevel)),
    treeState.reverse(),
  ];
};

export const createProllyTreeNodes = (ids: number[]): Node[] =>
  ids.map((id) => {
    const hash = hasher.digest(new Uint8Array(Array(id).fill(id))).digest;
    return new DefaultNode(id, hash, hash);
  });
