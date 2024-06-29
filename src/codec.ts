/**
 * Encoding/decoding of nodes and buckets
 */

import { CodeError } from "code-err";
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
  decodeFirst(bytes: Uint8Array): [any, Uint8Array]; // checks if U is a tuple or an array
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

export const UNEXPECTED_NODE_FORMAT = "UNEXPECTED_NODE_FORMAT";

export function decodeNodeFirst<Code extends number, Alg extends number>(
  bytes: Uint8Array,
  codec: TreeCodec<Code, Alg>,
): [DefaultNode, Uint8Array] {
  const [node, remainder]: [EncodedNode, Uint8Array] = codec.decodeFirst(bytes);

  if (!Array.isArray(node)) {
    throw new CodeError("expected decoded node to be an array", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  if (typeof node[0] !== "number") {
    throw new CodeError("expected node timestamp field to be a number", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  if (!(node[1] instanceof Uint8Array)) {
    throw new CodeError("expected node hash field to be a byte array", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

  if (!(node[2] instanceof Uint8Array)) {
    throw new CodeError("expected node message field to be a byte array", {
      code: UNEXPECTED_NODE_FORMAT,
    });
  }

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

export const UNEXPECTED_BUCKET_FORMAT = "UNEXPECTED_BUCKET_FORMAT";
export const UNEXPECTED_CODEC = "UNEXPECTED_CODEC";
export const UNEXPECTED_HASHER = "UNEXPECTED_HASHER";

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

  if (typeof prefix !== "object") {
    throw new CodeError("expected decoded prefix to be an object", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }

  if (typeof prefix.average !== "number") {
    throw new CodeError("expected prefix average field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }

  if (typeof prefix.level !== "number") {
    throw new CodeError("expected prefix level field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
  }

  if (typeof prefix.mc !== "number") {
    throw new CodeError("expected prefix mc field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
    if (prefix.mc !== codec.code) {
      throw new CodeError(
        `expected codec code to be ${codec.code}. observed code: ${codec.code}`,
        { code: UNEXPECTED_CODEC },
      );
    }
  }

  if (typeof prefix.mh !== "number") {
    throw new CodeError("expected prefix mh field to be a number", {
      code: UNEXPECTED_BUCKET_FORMAT,
    });
    if (prefix.mh !== hasher.code) {
      throw new CodeError(
        `expected hasher code to be ${hasher.code}. observed code: ${hasher.code}`,
        { code: UNEXPECTED_HASHER },
      );
    }
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
    prefix,
    nodes,
    bytes,
    hasher.digest(bytes).digest,
  );
}
