import { encodeOptions, decodeOptions } from "@ipld/dag-cbor";
import { sha256 as hashfn } from "@noble/hashes/sha256";
import * as cbor from "cborg";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import {
  decodeFirst as decodeNodeFirst,
  type EncodedNode,
  type Node,
} from "./node.js";
import type { Blockstore } from "interface-blockstore";
import type { ByteView } from "multiformats/interface";

export interface Prefix {
  level: number;
  average: number;
  mh: number;
  mc: number;
}

export class Bucket {
  constructor(
    readonly prefix: Prefix,
    readonly nodes: Node[],
    readonly bytes?: ByteView<EncodedBucket>,
    public cid?: CID
  ) {}

  getBytes(): Uint8Array {
    if (this.bytes == null) {
      return encode(this);
    }

    return this.bytes;
  }

  getCID(): CID {
    if (this.cid == null) {
      this.cid = digest2cid(this.prefix)(digest(this.getBytes()));
    }

    return this.cid;
  }
}

export type EncodedBucket = [Prefix, ...EncodedNode[]];

export function encode(bucket: Bucket): ByteView<EncodedBucket> {
  const encodedPrefix = cbor.encode(bucket.prefix, encodeOptions);
  const bytedNodes: Uint8Array[] = [];

  let len = 0;
  for (const node of bucket.nodes) {
    const bytes: ByteView<EncodedNode> = cbor.encode(
      [node.timestamp, node.hash, node.message],
      encodeOptions
    );
    bytedNodes.push(bytes);
    len += bytes.length;
  }

  const encodedNodes: ByteView<EncodedNode[]> = new Uint8Array(len);

  len = 0;
  for (const bytes of bytedNodes) {
    encodedNodes.set(bytes, len);
    len += bytes.length;
  }

  const encodedBucket = new Uint8Array(
    encodedPrefix.length + encodedNodes.length
  );
  encodedBucket.set(encodedPrefix);
  encodedBucket.set(encodedNodes, encodedPrefix.length);

  return encodedBucket;
}

export function decode(
  bytes: ByteView<unknown>,
  cid: CID
): Bucket {
  let decoded: [unknown, ByteView<unknown>];

  try {
    decoded = cbor.decodeFirst(bytes, decodeOptions);
  } catch (e) {
    throw new Error("failed to decode bucket");
  }

  // do some verification here
  const prefix: Prefix = decoded[0] as any;

  const encodedNodes = decoded[1];

  const nodes: Node[] = [];

  let node: Node, remainder: ByteView<EncodedNode[]>;

  while (bytes.length > 0) {
    try {
      [node, remainder] = decodeNodeFirst(bytes);
      // do some verification of node here
    } catch {
      throw new Error("error decoding nodes from bucket");
    }
    nodes.push(node);
    bytes = remainder;
  }

  return new Bucket(prefix, nodes, bytes as ByteView<EncodedBucket>, cid);
}

export const digest: (bytes: ByteView<EncodedBucket>) => Uint8Array = hashfn;
export const digest2cid = (prefix: Prefix) => (digest: Uint8Array): CID =>
  CID.createV1(prefix.mc, createMultihashDigest(prefix.mh, digest));
export const cid2digest = (cid: CID): Uint8Array => cid.multihash.digest

export async function loadBucket(
  blockstore: Blockstore,
  cid: CID,
  expectedPrefix: Prefix
): Promise<Bucket> {
  let bytes: ByteView<unknown>;
  try {
    bytes = await blockstore.get(cid);
  } catch {
    throw new Error("data for bucket cid is missing");
  }

  let bucket: Bucket;
  try {
    bucket = decode(bytes, cid);
  } catch {
    throw new Error("failed to decode bucket");
  }

  if (
    expectedPrefix.average !== bucket.prefix.average ||
    expectedPrefix.level !== bucket.prefix.level ||
    expectedPrefix.mh !== bucket.prefix.mh ||
    expectedPrefix.mc !== bucket.prefix.mc
  ) {
    throw new Error('bucket has unexpected prefix')
  }

  return bucket;
}
