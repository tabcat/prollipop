/**
 * Encoding/decoding of nodes and buckets
 */

import { code, decodeOptions, encodeOptions, name } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import * as cborg from "cborg";
import { decode, decodeFirst, encode } from "cborg";
import type {
  ArrayBufferView,
  ByteView,
  SyncMultihashHasher,
} from "multiformats";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { sha256 as mh_sha256 } from "multiformats/hashes/sha2";
import { MultihashDigest } from "multiformats/interface";
import { DefaultBucket, DefaultNode } from "./impls.js";
import { Bucket, Node, Prefix, Tuple } from "./interface.js";
import { createNamedErrorClass } from "./internal.js";

const CodecError = createNamedErrorClass("CodecError");

export type Bytes<T> = ByteView<T> | ArrayBufferView<T>;

export const handleBuffer = <T>(bytes: Bytes<T>): ByteView<T> =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

/**
 * Similar to the BlockCodec interface from multiformats but decode functions return values with unknown types.
 * Also includes the decodeFirst method from @ipld/dag-cbor.
 */
export interface SafeBlockCodec<Code extends number, Universe = any> {
  name: string;
  code: Code;
  encode<T extends Universe>(data: T): ByteView<T>;
  decode(bytes: Uint8Array): unknown;
  decodeFirst(bytes: Uint8Array): [unknown, Uint8Array];
}

export type EncodedTuple = [Tuple["timestamp"], Tuple["hash"]];
export type EncodedNode = [...EncodedTuple, Node["message"]];

export const encoder: SafeBlockCodec<113> = {
  name,
  code,
  encode: (value) => encode(value, encodeOptions),
  decode: (bytes) => decode(handleBuffer(bytes), decodeOptions),
  decodeFirst: (bytes) => decodeFirst(handleBuffer(bytes), decodeOptions),
};

export const hasher: SyncMultihashHasher<18> = {
  name: mh_sha256.name,
  code: mh_sha256.code,
  digest: (input: Uint8Array): MultihashDigest<18> =>
    createMultihashDigest(mh_sha256.code, sha256(input)),
};

export function encodeNode(
  timestamp: number,
  hash: Uint8Array,
  message: Uint8Array,
): ByteView<EncodedNode> {
  return encoder.encode([timestamp, hash, message]);
}

export const getValidatedEncodedNode = (encodedNode: unknown): EncodedNode => {
  if (!Array.isArray(encodedNode)) {
    throw new CodecError("Expected encoded node to be an array.");
  }

  const [timestamp, hash, message] = encodedNode as Partial<EncodedNode>;

  if (typeof timestamp !== "number") {
    throw new CodecError("Expected node timestamp field to be a number.");
  }

  if (!(hash instanceof Uint8Array)) {
    throw new CodecError("Expected node hash field to be a byte array.");
  }

  if (!(message instanceof Uint8Array)) {
    throw new CodecError("Expected node message field to be a byte array.");
  }

  return [timestamp, hash, message];
};

export function decodeNodeFirst(bytes: Uint8Array): [Node, Uint8Array] {
  const [encodedNode, remainder]: [unknown, Uint8Array] =
    encoder.decodeFirst(bytes);

  return [new DefaultNode(...getValidatedEncodedNode(encodedNode)), remainder];
}

export type EncodedBucket<Code extends number, Alg extends number> = [
  Prefix<Code, Alg>,
  ...EncodedNode[],
];

export function encodeBucket<Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  nodes: Node[],
): ByteView<EncodedBucket<Code, Alg>> {
  // prefix must be dag-cbor encoded
  const encodedPrefix: ByteView<Prefix<Code, Alg>> = encoder.encode(prefix);
  const bytedNodes: Uint8Array[] = [];

  let len = 0;
  for (const node of nodes) {
    const bytes: ByteView<EncodedNode> = encodeNode(
      node.timestamp,
      node.hash,
      node.message,
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

export const getValidatedPrefix = <Code extends number, Alg extends number>(
  prefix: unknown,
): Prefix<Code, Alg> => {
  if (typeof prefix !== "object") {
    throw new CodecError("Expected bucket prefix to be an object.");
  }

  const { average, level, mc, mh } = prefix as Partial<Prefix<Code, Alg>>;

  if (typeof average !== "number") {
    throw new CodecError("Expected prefix average field to be a number.");
  }

  if (typeof level !== "number") {
    throw new CodecError("Expected prefix level field to be a number.");
  }

  if (typeof mc !== "number") {
    throw new CodecError("Expected prefix mc field to be a number.");
  }
  if (encoder.code !== mc) {
    throw new CodecError(
      `Expected multicodec code to be ${encoder.code}. Received ${mc}.`,
    );
  }

  if (typeof mh !== "number") {
    throw new CodecError("Expected prefix mh field to be a number.");
  }
  if (hasher.code !== mh) {
    throw new CodecError(
      `Expected multihash code to be ${hasher.code}. Received ${mh}.`,
    );
  }

  return { average, mc, mh, level };
};

export function decodeBucket<Code extends number, Alg extends number>(
  bytes: Uint8Array,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> {
  // prefix is always dag-cbor
  const decoded: [unknown, Uint8Array] = cborg.decodeFirst(
    bytes,
    decodeOptions,
  );

  const prefix: Prefix<Code, Alg> = getValidatedPrefix(decoded[0]);

  const nodes: Node[] = [];
  while (decoded[1].length > 0) {
    [nodes[nodes.length], decoded[1]] = decodeNodeFirst(decoded[1]);
  }

  return new DefaultBucket<Code, Alg>(
    prefix,
    nodes,
    bytes,
    hasher.digest(bytes).digest,
  );
}
