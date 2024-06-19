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

export interface Prefix<Code extends number, Alg extends number> {
  level: number;
  average: number; // same for all buckets of the same tree
  mc: Code; // same for all buckets of the same tree
  mh: Alg; // same for all buckets of the same tree
}

export interface Bucket<Code extends number, Alg extends number> {
  readonly prefix: Prefix<Code, Alg>;
  readonly nodes: Node[];
  getBytes(): Uint8Array;
  getCID(): CID;
  getHash(): Uint8Array;
}

export const matchesBucketPrefix =
  <T, Code extends number, Alg extends number>(
    codec?: TreeCodec<Code, Alg>,
    hasher?: SyncMultihashHasher<Alg>,
  ) =>
  (prefix: Prefix<Code, Alg>): boolean =>
    (codec == null || codec.code === prefix.mc) &&
    (hasher == null || hasher.code === prefix.mh);

export class DefaultBucket<Code extends number, Alg extends number>
  implements Bucket<Code, Alg>
{
  #codec: TreeCodec<Code, Alg>;
  #hasher: SyncMultihashHasher<Alg>;
  #bytes?: Uint8Array;
  #hash?: Uint8Array;

  constructor(
    readonly prefix: Prefix<Code, Alg>,
    readonly nodes: Node[],
    codec: TreeCodec<Code, Alg>,
    hasher: SyncMultihashHasher<Alg>,
    bytes?: ByteView<EncodedBucket<Code, Alg>>,
    hash?: Uint8Array,
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

export type EncodedBucket<Code extends number, Alg extends number> = [
  Prefix<Code, Alg>,
  ...EncodedNode[],
];

export function encode<T, Code extends number, Alg extends number>(
  bucket: Bucket<Code, Alg>,
  codec: TreeCodec<Code, Alg>,
): ByteView<EncodedBucket<Code, Alg>> {
  const encodedPrefix: ByteView<Prefix<Code, Alg>> = codec.encode(
    bucket.prefix,
  );
  const bytedNodes: Uint8Array[] = [];

  let len = 0;
  for (const node of bucket.nodes) {
    const bytes: ByteView<EncodedNode> = encodeNode(
      node.timestamp,
      node.hash,
      node.message,
      codec,
    );
    bytedNodes.push(bytes);
    len += bytes.length;
  }

  const encodedBucket: ByteView<EncodedBucket<Code, Alg>> = new Uint8Array(
    encodedPrefix.length + len,
  );

  encodedBucket.set(encodedPrefix);
  len = encodedPrefix.length;
  for (const bytes of bytedNodes) {
    encodedBucket.set(bytes, len);
    len += bytes.length;
  }

  return encodedBucket;
}

export function decode<T, Code extends number, Alg extends number>(
  bytes: ByteView<EncodedBucket<Code, Alg>>,
  hash: Uint8Array,
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> {
  let decoded: [Prefix<Code, Alg>, ByteView<EncodedNode[]>];
  try {
    decoded = codec.decodeFirst(bytes);
  } catch (e) {
    throw new Error("failed to decode bucket");
  }

  // do some verification here
  const prefix: Prefix<Code, Alg> = decoded[0];

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
    bytes as ByteView<EncodedBucket<Code, Alg>>,
    hash,
  );
}

export const digest2cid =
  <Code extends number, Alg extends number>(prefix: Prefix<Code, Alg>) =>
  (digest: Uint8Array): CID =>
    CID.createV1(prefix.mc, createMultihashDigest(prefix.mh, digest));

export const cid2digest = (cid: CID): Uint8Array => cid.multihash.digest;

export const createEmptyBucket = <T, Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> => new DefaultBucket(prefix, [], codec, hasher);

export async function loadBucket<T, Code extends number, Alg extends number>(
  blockstore: Blockstore,
  hash: Uint8Array,
  expectedPrefix: Prefix<Code, Alg>,
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Promise<Bucket<Code, Alg>> {
  let bytes: ByteView<EncodedBucket<Code, Alg>>;
  try {
    bytes = await blockstore.get(digest2cid(expectedPrefix)(hash));
  } catch {
    throw new Error("data for bucket cid is missing");
  }

  let bucket: Bucket<Code, Alg>;
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
