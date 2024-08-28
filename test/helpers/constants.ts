import { encodeOptions } from "@ipld/dag-cbor";
import { MemoryBlockstore } from "blockstore-core";
import * as cbor from "cborg";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { EncodedNode, encoder, hasher } from "../../src/codec.js";
import { DefaultBucket, DefaultNode } from "../../src/impls.js";
import { Bucket, Prefix, Tuple } from "../../src/interface.js";
import { createProllyTree, createProllyTreeNodes } from "./create-tree.js";

// nodes
export const timestamp = 0;
export const hash = new Uint8Array(4); // isBoundaryHash expects Uint8Array with length >= 4
export const message = new Uint8Array(0);
export const node = new DefaultNode(timestamp, hash, message);
export const encodedNode: EncodedNode = [timestamp, hash, message];
export const nodeBytes = cbor.encode(encodedNode, encodeOptions);
export const nodeBytes2 = new Uint8Array([...nodeBytes, ...nodeBytes]);

// buckets
export const prefix: Prefix = {
  average: 30,
  level: 0,
};
export const prefixBytes = cbor.encode(prefix, encodeOptions);
export const bucketBytes = new Uint8Array([...prefixBytes, ...nodeBytes]);
export const bucketHash = hasher.digest(bucketBytes).digest;
export const bucketCid = CID.createV1(
  encoder.code,
  createMultihashDigest(hasher.code, bucketHash),
);
export const bucket: Bucket = new DefaultBucket(
  prefix,
  [node],
  bucketBytes,
  bucketHash,
);
export const emptyBucket: Bucket = new DefaultBucket(
  prefix,
  [],
  prefixBytes,
  hasher.digest(prefixBytes).digest,
);

export const blockstore = new MemoryBlockstore();

export const treeNodesMax = 64;

export const treeNodes = createProllyTreeNodes(
  Array(treeNodesMax)
    .fill(0)
    .map((_, i) => i),
);
export const treeTuples: Tuple[] = treeNodes.map(({ timestamp, hash }) => ({
  timestamp,
  hash,
}));
export const [tree, treeState] = createProllyTree(
  blockstore,
  prefix,
  treeNodes,
);
