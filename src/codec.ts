/**
 * Encoding/decoding of nodes and buckets
 */

import { CodeError } from "code-err";
import type {
  ArrayBufferView,
  ByteView,
  SyncMultihashHasher,
} from "multiformats";
import { DefaultBucket, DefaultNode } from "./impls.js";
import { Bucket, Node, Prefix, Tuple } from "./interface.js";

export type Bytes<T> = ByteView<T> | ArrayBufferView<T>;

export const handleBuffer = <T>(bytes: Bytes<T>): ByteView<T> =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

/**
 * Similar to BlockCodec from multiformats but decode functions return values with unknown types
 */
interface SafeBlockCodec<Code extends number, Universe = any> {
  name: string;
  code: Code;
  encode<T extends Universe>(data: T): ByteView<T>;
  decode(bytes: Uint8Array): unknown;
  decodeFirst(bytes: Uint8Array): [unknown, Uint8Array];
}

export interface TreeCodec<Code extends number, Alg extends number>
  extends SafeBlockCodec<Code, Prefix<Code, Alg> | EncodedNode> {}

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

export const UNEXPECTED_NODE_FORMAT = "UNEXPECTED_NODE_FORMAT";

export function decodeNodeFirst<Code extends number, Alg extends number>(
  bytes: Uint8Array,
  codec: TreeCodec<Code, Alg>,
): [DefaultNode, Uint8Array] {
  const [node, remainder]: [unknown, Uint8Array] = codec.decodeFirst(bytes);

  if (!Array.isArray(node)) {
    throw new CodeError("expected decoded node to be an array", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  const [timestamp, hash, message] = node as Partial<EncodedNode>;

  if (typeof timestamp !== "number") {
    throw new CodeError("expected node timestamp field to be a number", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  if (!(hash instanceof Uint8Array)) {
    throw new CodeError("expected node hash field to be a byte array", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  if (!(message instanceof Uint8Array)) {
    throw new CodeError("expected node message field to be a byte array", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  return [new DefaultNode(timestamp, hash, message), remainder];
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

export const UNEXPECTED_BUCKET_FORMAT = "UNEXPECTED_BUCKET_FORMAT";
export const UNEXPECTED_CODEC = "UNEXPECTED_CODEC";
export const UNEXPECTED_HASHER = "UNEXPECTED_HASHER";

export function decodeBucket<Code extends number, Alg extends number>(
  bytes: Uint8Array,
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> {
  let decoded: [unknown, Uint8Array];
  try {
    decoded = codec.decodeFirst(bytes);
  } catch (e) {
    throw new Error("failed to decode bucket");
  }

  const prefix = decoded[0];

  if (prefix != null && typeof prefix !== "object") {
    throw new CodeError("expected decoded prefix to be an object", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }

  const { average, level, mc, mh } = prefix as Partial<Prefix<Code, Alg>>;

  if (typeof average !== "number") {
    throw new CodeError("expected prefix average field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }

  if (typeof level !== "number") {
    throw new CodeError("expected prefix level field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }

  if (typeof mc !== "number") {
    throw new CodeError("expected prefix mc field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }
  if (mc !== codec.code) {
    throw new CodeError(
      `expected codec code to be ${codec.code}. observed code: ${codec.code}`,
      { code: UNEXPECTED_CODEC },
    );
  }

  if (typeof mh !== "number") {
    throw new CodeError("expected prefix mh field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }
  if (mh !== hasher.code) {
    throw new CodeError(
      `expected hasher code to be ${hasher.code}. observed code: ${hasher.code}`,
      { code: UNEXPECTED_HASHER },
    );
  }

  const nodes: Node[] = [];

  while (decoded[1].length > 0) {
    try {
      [nodes[nodes.length], decoded[1]] = decodeNodeFirst(decoded[1], codec);
    } catch {
      throw new Error("error decoding nodes from bucket");
    }
  }

  return new DefaultBucket<Code, Alg>(
    { average, level, mc, mh },
    nodes,
    bytes,
    hasher.digest(bytes).digest,
  );
}
