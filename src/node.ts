import * as cbor from "cborg";
import { compare as compareHash } from "uint8arrays";
import type { ByteView } from "multiformats/interface";
import { decodeOptions, encodeOptions } from "@ipld/dag-cbor";

export interface Tuple {
  timestamp: number;
  hash: Uint8Array;
}

export class Node implements Tuple {
  #bytes: Uint8Array;

  constructor(
    readonly timestamp: number,
    readonly hash: Uint8Array,
    // Branch node messages will always be SHA256 digest of the child bucket.
    readonly message: Uint8Array
  ) {}

  asBytes (): Uint8Array {
    if (this.#bytes == null) {
      encode(this.timestamp, this.hash, this.message);
    }

    return this.#bytes;
  }
}

type EncodedTuple = [Tuple["timestamp"], Tuple["hash"]];
export type EncodedNode = [...EncodedTuple, Node["message"]];

export function encode(
  timestamp: number,
  hash: Uint8Array,
  message: Uint8Array
): ByteView<EncodedNode> {
  return cbor.encode([timestamp, hash, message], encodeOptions);
}

export function decodeFirst(
  bytes: ByteView<unknown>
): [Node, Uint8Array] {
  const [decoded, remainder]: [unknown, Uint8Array] =
    cbor.decodeFirst(bytes, decodeOptions);

  // do verification here
  const [timestamp, hash, message]: EncodedNode = decoded as any

  return [new Node(timestamp, hash, message), remainder];
}

export const extractTuple = ({ timestamp, hash }: Tuple): Tuple => ({
  timestamp,
  hash,
});

export const compare = (a: Node, b: Node): number => {
  const tuples = compareTuples(a, b);

  if (tuples !== 0) {
    return tuples;
  }

  return compareHash(a.message, b.message);
};

export const compareTuples = (a: Tuple, b: Tuple): number => {
  const difference = compareTimestamp(a.timestamp, b.timestamp);

  if (difference !== 0) return difference;

  const comparison = compareHash(a.hash, b.hash);

  return comparison;
};

export const compareTimestamp = (a: number, b: number): number => a - b;

/**
 * Returns the index of the first nodes which is greater than or equal to the given tuple.
 * If no nodes exist which are greater than or equal to the given tuple then it returns the last index.
 * 
 * @param nodes 
 * @param tuple 
 * @returns 
 */
export const findIndexClosestToGTE = (nodes: Node[], tuple: Tuple): number => {
  let index: number = 0;

  for (const node of nodes) {
    const comparison = compareTuples(tuple, node);

    if (comparison <= 0) {
      return index;
    }

    index++;
  }

  return index - 1;
};
