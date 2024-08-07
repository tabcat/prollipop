import { encodeOptions } from "@ipld/dag-cbor";
import * as cbor from "cborg";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { EncodedNode } from "../../src/codec.js";
import { DefaultBucket, DefaultNode } from "../../src/impls.js";
import {
  cborTreeCodec,
  sha256SyncHasher,
  sha256SyncHasher as syncHasher,
  cborTreeCodec as treeCodec,
} from "../../src/index.js";
import { Bucket, Prefix } from "../../src/interface.js";
import { MemoryBlockstore } from "blockstore-core";
import { createProllyTree } from "./tree.js";

// nodes
export const timestamp = 0;
export const hash = new Uint8Array(4); // isBoundaryHash expects Uint8Array with length >= 4
export const message = new Uint8Array(0);
export const node = new DefaultNode(timestamp, hash, message);
export const encodedNode: EncodedNode = [timestamp, hash, message];
export const nodeBytes = cbor.encode(encodedNode, encodeOptions);
export const nodeBytes2 = new Uint8Array([...nodeBytes, ...nodeBytes]);

// buckets
export type Mc = typeof treeCodec.code;
export type Mh = typeof syncHasher.code;
export const prefix: Prefix<Mc, Mh> = {
  average: 4,
  level: 0,
  mc: treeCodec.code,
  mh: syncHasher.code,
};
export const prefixBytes = cbor.encode(prefix, encodeOptions);
export const bucketBytes = new Uint8Array([...prefixBytes, ...nodeBytes]);
export const bucketHash = syncHasher.digest(bucketBytes).digest;
export const bucketCid = CID.createV1(
  treeCodec.code,
  createMultihashDigest(syncHasher.code, bucketHash),
);
export const bucket: Bucket<Mc, Mh> = new DefaultBucket(
  prefix,
  [node],
  bucketBytes,
  bucketHash,
);
export const emptyBucket: Bucket<Mc, Mh> = new DefaultBucket(
  prefix,
  [],
  prefixBytes,
  syncHasher.digest(prefixBytes).digest,
);

export const blockstore = new MemoryBlockstore();
const treeNodes = Array(30)
  .fill(0)
  .map((_, i) => ({
    timestamp: i,
    hash: new Uint8Array(Array(4).fill(i)),
    message: new Uint8Array(Array(4).fill(i)),
  }));
export const tree = createProllyTree(blockstore, prefix, treeNodes, cborTreeCodec, sha256SyncHasher);
