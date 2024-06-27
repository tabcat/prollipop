/**
 * Encoding/decoding of nodes and buckets
 */

import type {
  ArrayBufferView,
  BlockCodec,
  ByteView,
  SyncMultihashHasher,
} from "multiformats";
import { DefaultBucket, DefaultNode } from "./impls.js";
import { Bucket, Node, Prefix, Tuple } from "./interface.js";

export type Bytes<T> = ByteView<T> | ArrayBufferView<T>;

export const handleBuffer = <T>(bytes: Bytes<T>): ByteView<T> =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

interface BlockCodecPlus<Code extends number, Universe = any>
  extends BlockCodec<Code, Universe> {
  name: string;
  code: Code;
  encode<T extends Universe>(data: T): ByteView<T>;
  decode<T extends Universe>(bytes: Bytes<T>): T;
  decodeFirst(
    bytes: Uint8Array,
  ): [any, Uint8Array]; // checks if U is a tuple or an array
}

export interface TreeCodec<Code extends number, Alg extends number>
  extends BlockCodecPlus<Code, Prefix<Code, Alg> | EncodedNode> {}

export type EncodedTuple = [Tuple["timestamp"], Tuple["hash"]];
export type EncodedNode = [...EncodedTuple, Node["message"]];

export function encodeNode<Code extends number, Alg extends number>(
  timestamp: number,
  hash: Uint8Array,
  message: Uint8Array,
  codec: TreeCodec<Code, Alg>,
): ByteView<EncodedNode> {
  return codec.encode([timestamp, hash, message]);
}

export function decodeNodeFirst<Code extends number, Alg extends number>(
  bytes: Uint8Array,
  codec: TreeCodec<Code, Alg>,
): [DefaultNode, Uint8Array] {
  const [node, remainder]: [EncodedNode, Uint8Array] = codec.decodeFirst(bytes);

  // do verification on decoded here

  return [new DefaultNode(...node), remainder];
}

export type EncodedBucket<Code extends number, Alg extends number> = [
  Prefix<Code, Alg>,
  ...EncodedNode[],
];

export function encodeBucket<Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  nodes: Node[],
  codec: TreeCodec<Code, Alg>,
): ByteView<EncodedBucket<Code, Alg>> {
  const encodedPrefix: ByteView<Prefix<Code, Alg>> = codec.encode(prefix);
  const bytedNodes: Uint8Array[] = [];

  let len = 0;
  for (const node of nodes) {
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

export function decodeBucket<Code extends number, Alg extends number>(
  bytes: Uint8Array,
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> {
  let decoded: [Prefix<Code, Alg>, Uint8Array];
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
    bytes,
    hasher.digest(bytes).digest,
  );
}
