import { decode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import type { ByteView } from "multiformats";
import { DefaultBucket, DefaultNode } from "./impls.js";
import { Bucket, Node, Prefix } from "./interface.js";

type EncodedNode = [Node["seq"], Node["key"], Node["val"]];

export interface EncodedBucket {
  level: number;
  average: number;
  nodes: EncodedNode[];
}

const getValidatedNode = (encodedNode: unknown): EncodedNode => {
  if (typeof encodedNode !== "object" || !Array.isArray(encodedNode)) {
    throw new TypeError("Expected encoded node to be an array.");
  }

  const [timestamp, hash, message] = encodedNode as Partial<EncodedNode>;

  if (typeof timestamp !== "number") {
    throw new TypeError("Expected node timestamp field to be a number.");
  }

  if (!(hash instanceof Uint8Array)) {
    throw new TypeError("Expected node hash field to be a byte array.");
  }

  if (!(message instanceof Uint8Array)) {
    throw new TypeError("Expected node message field to be a byte array.");
  }

  return [timestamp, hash, message];
};

const getValidatedPrefix = (prefix: unknown): Prefix => {
  if (typeof prefix !== "object") {
    throw new TypeError("Expected bucket prefix to be an object.");
  }

  const { average, level } = prefix as Partial<Prefix>;

  if (typeof average !== "number") {
    throw new TypeError("Expected prefix average field to be a number.");
  }

  if (typeof level !== "number") {
    throw new TypeError("Expected prefix level field to be a number.");
  }

  return { average, level };
};

const getValidatedBucket = (bucket: unknown): EncodedBucket => {
  if (typeof bucket !== "object" || bucket == null) {
    throw new TypeError("Expected bucket to be an object.");
  }

  const { average, level } = getValidatedPrefix(bucket);

  const { nodes } = bucket as Partial<EncodedBucket>;

  if (typeof nodes !== "object" || !Array.isArray(nodes)) {
    throw new TypeError("Expected bucket nodes field to be a number.");
  }

  return { average, level, nodes };
};

export function encodeBucket(
  average: number,
  level: number,
  nodes: Node[],
): ByteView<EncodedBucket> {
  return encode({
    average,
    level,
    nodes: nodes.map(({ seq: timestamp, key: hash, val: message }) => [
      timestamp,
      hash,
      message,
    ]),
  });
}

export function decodeBucket(
  bytes: Uint8Array,
  expectedPrefix: Prefix,
): Bucket {
  const decoded = decode(bytes);

  const { average, level, nodes: encodedNodes } = getValidatedBucket(decoded);

  if (average !== expectedPrefix.average) {
    throw new TypeError(
      `Expect prefix to have average ${expectedPrefix.average}. Received prefix with average ${average}`,
    );
  }

  if (level !== expectedPrefix.level) {
    throw new TypeError(
      `Expect prefix to have level ${expectedPrefix.level}. Received prefix with level ${level}`,
    );
  }

  // could validate boundaries and tuple order here
  let i = 0;
  const nodes: Node[] = new Array(encodedNodes.length);
  for (const node of encodedNodes) {
    nodes[i] = new DefaultNode(...getValidatedNode(node));
    i++;
  }

  return new DefaultBucket(average, level, nodes, bytes, sha256(bytes));
}
