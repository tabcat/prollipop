import { compare as compareHash } from "uint8arrays";
import type { ByteView } from "multiformats/interface";
import { TreeCodec } from "./codec";

export interface Tuple {
  timestamp: number;
  hash: Uint8Array;
}

export interface Node extends Tuple {
  message: Uint8Array;
  asBytes(): Uint8Array;
}

export class DefaultNode<Code extends number, Alg extends number> implements Node {
  #bytes: Uint8Array;
  #codec: TreeCodec<Code, Alg>;

  constructor(
    readonly timestamp: number,
    readonly hash: Uint8Array,
    readonly message: Uint8Array,
    codec: TreeCodec<Code, Alg>
  ) {
    this.#codec = codec;
  }

  asBytes(): Uint8Array {
    if (this.#bytes == null) {
      this.#bytes = encode(
        this.timestamp,
        this.hash,
        this.message,
        this.#codec
      );
    }

    return this.#bytes;
  }
}

type EncodedTuple = [Tuple["timestamp"], Tuple["hash"]];
export type EncodedNode = [...EncodedTuple, Node["message"]];

export function encode<Code extends number, Alg extends number>(
  timestamp: number,
  hash: Uint8Array,
  message: Uint8Array,
  codec: TreeCodec<Code, Alg>
): ByteView<EncodedNode> {
  return codec.encode([timestamp, hash, message]);
}

export function decodeFirst<Code extends number, Alg extends number>(
  bytes: ByteView<EncodedNode[]>,
  codec: TreeCodec<Code, Alg>
): [DefaultNode<Code, Alg>, Uint8Array] {
  const [decoded, remainder] = codec.decodeFirst(bytes);

  // do verification on decoded here

  return [new DefaultNode(...decoded, codec), remainder];
}

export const extractTuple = ({ timestamp, hash }: Tuple): Tuple => ({
  timestamp,
  hash,
});

export const compareNodes = (a: Node, b: Node): number => {
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
export const findIndexGTE = <T extends Tuple>(
  nodes: T[],
  tuple: Tuple
): number => {
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
