import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import {
  decodeFirst as decodeNodeFirst,
  encode as encodeNode,
  type EncodedNode,
  type Node,
} from "./node.js";
import type { Blockstore } from "interface-blockstore";
import type { ByteView, SyncMultihashHasher } from "multiformats/interface";
import { TreeCodec } from "./codec.js";

export interface Prefix {
  level: number;
  average: number; // same for all buckets of the same tree
  mh: number; // same for all buckets of the same tree
  mc: number; // same for all buckets of the same tree
}

export interface Bucket {
  readonly prefix: Prefix;
  readonly nodes: Node[];
  getBytes(): Uint8Array;
  getCID(): CID;
  getHash(): Uint8Array;
}

export const matchesBucketPrefix =
  <T, Code extends number, Alg extends number>(
    codec?: TreeCodec<Code>,
    hasher?: SyncMultihashHasher<Alg>
  ) =>
  (prefix: Prefix): boolean =>
    (codec == null || codec.code === prefix.mc) &&
    (hasher == null || hasher.code === prefix.mh);

export class DefaultBucket<Code extends number, Alg extends number>
  implements Bucket
{
  #codec: TreeCodec<Code>;
  #hasher: SyncMultihashHasher<Alg>;
  #bytes?: Uint8Array;
  #hash?: Uint8Array;

  constructor(
    readonly prefix: Prefix,
    readonly nodes: Node[],
    codec: TreeCodec<Code>,
    hasher: SyncMultihashHasher<Alg>,
    bytes?: ByteView<EncodedBucket>,
    hash?: Uint8Array
  ) {
    if (!matchesBucketPrefix(codec, hasher)(prefix)) {
      throw new Error("codec or hasher is mismatched to prefix");
    }

    this.#codec = codec;
    this.#hasher = hasher;
    this.#bytes = bytes;
    this.#hash = hash;
  }

  getBytes(): Uint8Array {
    if (this.#bytes == null) {
      this.#bytes = encode(this, this.#codec);
    }

    return this.#bytes;
  }

  getHash(): Uint8Array {
    if (this.#hash == null) {
      this.#hash = this.#hasher.digest(this.getBytes()).digest;
    }

    return this.#hash;
  }

  getCID(): CID {
    return digest2cid(this.prefix)(this.getHash());
  }
}

export type EncodedBucket = [Prefix, ...EncodedNode[]];

export function encode<Code extends number>(
  bucket: Bucket,
  codec: TreeCodec<Code>
): ByteView<EncodedBucket> {
  const encodedPrefix: ByteView<Prefix> = codec.encode(bucket.prefix);
  const bytedNodes: Uint8Array[] = [];

  let len = 0;
  for (const node of bucket.nodes) {
    const bytes: ByteView<EncodedNode> = encodeNode(
      node.timestamp,
      node.hash,
      node.message,
      codec
    );
    bytedNodes.push(bytes);
    len += bytes.length;
  }

  const encodedBucket: ByteView<EncodedBucket> = new Uint8Array(encodedPrefix.length + len);

  encodedBucket.set(encodedPrefix);
  len = encodedPrefix.length;
  for (const bytes of bytedNodes) {
    encodedBucket.set(bytes, len);
    len += bytes.length;
  }

  return encodedBucket;
}

export function decode<Code extends number, Alg extends number>(
  bytes: ByteView<EncodedBucket>,
  hash: Uint8Array,
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>
): Bucket {
  let decoded: [Prefix, ByteView<EncodedNode[]>];
  try {
    decoded = codec.decodeFirst(bytes);
  } catch (e) {
    throw new Error("failed to decode bucket");
  }

  // do some verification here
  const prefix: Prefix = decoded[0];

  const nodes: Node[] = [];

  while (decoded[1].length > 0) {
    try {
      [nodes[nodes.length], decoded[1]] = decodeNodeFirst(decoded[1], codec);
    } catch {
      throw new Error("error decoding nodes from bucket");
    }
  }

  return new DefaultBucket<Code, Alg>(
    prefix,
    nodes,
    codec,
    hasher,
    bytes as ByteView<EncodedBucket>,
    hash
  );
}

export const digest2cid =
  <Alg extends number>(prefix: Prefix) =>
  (digest: Uint8Array): CID =>
    CID.createV1(prefix.mc, createMultihashDigest(prefix.mh, digest));

export const cid2digest = (cid: CID): Uint8Array => cid.multihash.digest;

export const createEmptyBucket = <T, Code extends number, Alg extends number>(
  prefix: Prefix,
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>
): Bucket => new DefaultBucket(prefix, [], codec, hasher);

export async function loadBucket<T, Code extends number, Alg extends number>(
  blockstore: Blockstore,
  hash: Uint8Array,
  expectedPrefix: Prefix,
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>
): Promise<Bucket> {
  let bytes: ByteView<EncodedBucket>;
  try {
    bytes = await blockstore.get(digest2cid(expectedPrefix)(hash));
  } catch {
    throw new Error("data for bucket cid is missing");
  }

  let bucket: Bucket;
  try {
    bucket = decode(bytes, hash, codec, hasher);
  } catch {
    throw new Error("failed to decode bucket");
  }

  if (
    expectedPrefix.average !== bucket.prefix.average ||
    expectedPrefix.level !== bucket.prefix.level ||
    expectedPrefix.mc !== bucket.prefix.mc ||
    expectedPrefix.mh !== bucket.prefix.mh
  ) {
    throw new Error("bucket has unexpected prefix");
  }

  return bucket;
}
