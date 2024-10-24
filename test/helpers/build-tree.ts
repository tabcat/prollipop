import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { createIsBoundary } from "../../src/boundary.js";
import { encodeBucket } from "../../src/codec.js";
import { DefaultBucket, DefaultNode } from "../../src/impls.js";
import type { Bucket, Node } from "../../src/interface.js";

const levelOfNodes = (
  average: number,
  level: number,
  nodes: Node[],
): Node[][] => {
  const nodeLevel: Node[][] = [[]];
  for (const node of nodes) {
    lastElement(nodeLevel).push(new DefaultNode(node.seq, node.key, node.val));

    if (createIsBoundary(average, level)(node)) {
      nodeLevel.push([]);
    }
  }

  if (lastElement(nodeLevel).length === 0) {
    nodeLevel.pop();
  }

  return nodeLevel;
};

const levelOfBuckets = (
  average: number,
  level: number,
  nodeLevel: Node[][],
): Bucket[] => {
  if (nodeLevel.length === 0) {
    nodeLevel.push([]);
  }

  return nodeLevel.map((nodes) => {
    const bytes = encodeBucket(average, level, nodes);
    return new DefaultBucket(average, level, nodes, bytes, sha256(bytes));
  });
};

const nextLevelNodes = (buckets: Bucket[]): Node[] => {
  const nodes: Node[] = [];
  for (const bucket of buckets) {
    // should never get empty bucket here as there would not be another level
    nodes.push({ ...bucket.getBoundary()!, val: bucket.getDigest() });
  }
  return nodes;
};

export const buildProllyTreeState = (
  blockstore: Blockstore,
  average: number,
  nodes: Node[],
): Bucket[][] => {
  let level: number = 0;
  let nodeLevel = levelOfNodes(average, level, nodes);
  let bucketLevel = levelOfBuckets(average, level, nodeLevel);
  bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));

  const treeState: Bucket[][] = [bucketLevel];

  // tree has higher levels
  while (bucketLevel.length > 1) {
    if (level >= 4) {
      throw new Error("e");
    }
    level++;
    nodeLevel = levelOfNodes(average, level, nextLevelNodes(bucketLevel));
    bucketLevel = levelOfBuckets(average, level, nodeLevel);
    bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));
    treeState.push(bucketLevel);
  }

  return treeState.reverse(); // root to base
};

export const createProllyTreeNodes = (ids: number[]): Node[] =>
  ids.map((id) => {
    const hash = sha256(new Uint8Array(Array(id).fill(id)));
    // make message unique to tree
    const message = encode(id + -firstElement(ids) + lastElement(ids));
    return new DefaultNode(id, hash, message);
  });
