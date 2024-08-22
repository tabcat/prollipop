import * as dagCbor from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { decode, decodeFirst, encode } from "cborg";
import { Blockstore } from "interface-blockstore";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { sha256 as mh_sha256 } from "multiformats/hashes/sha2";
import { MultihashDigest, SyncMultihashHasher } from "multiformats/interface";
import { AddUpdate, RmUpdate, mutateTree } from "./builder.js";
import { TreeCodec, handleBuffer } from "./codec.js";
import { compareTuples } from "./compare.js";
import { createCursor } from "./cursor.js";
import { ProllyTreeDiff } from "./diff.js";
import { DefaultProllyTree } from "./impls.js";
import { Node, ProllyTree, Tuple } from "./interface.js";
import { createBucket } from "./utils.js";

export const cborTreeCodec: TreeCodec<typeof dagCbor.code> = {
  ...dagCbor,
  encode: (value) => encode(value, dagCbor.encodeOptions),
  decode: (bytes) => decode(handleBuffer(bytes), dagCbor.decodeOptions),
  decodeFirst: (bytes) =>
    decodeFirst(handleBuffer(bytes), dagCbor.decodeOptions),
};

export const sha256SyncHasher: SyncMultihashHasher<typeof mh_sha256.code> = {
  ...mh_sha256,
  digest: (input: Uint8Array): MultihashDigest<typeof mh_sha256.code> =>
    createMultihashDigest(mh_sha256.code, sha256(input)),
};

export interface InitOptions<Code extends number, Alg extends number> {
  codec: TreeCodec<Code>;
  hasher: SyncMultihashHasher<Alg>;
  averageBucketSize: number;
}

export function createEmptyTree(): ProllyTree<
  typeof cborTreeCodec.code,
  typeof sha256SyncHasher.code
>;
export function createEmptyTree<Code extends number, Alg extends number>(
  options: InitOptions<Code, Alg>,
): ProllyTree<Code, Alg>;
export function createEmptyTree<Code extends number, Alg extends number>(
  options?: InitOptions<Code, Alg>,
) {
  const codec = options?.codec ?? cborTreeCodec;
  const hasher = options?.hasher ?? sha256SyncHasher;
  const average = options?.averageBucketSize ?? 30;

  /**
   * data which is prefixed to each bucket, only the level ever changes
   */
  const prefix = {
    average,
    mc: codec.code,
    mh: hasher.code,
    level: 0,
  };

  return new DefaultProllyTree(
    createBucket(prefix, [], codec, hasher),
    codec,
    hasher,
  );
}

export function cloneTree<Code extends number, Alg extends number>(
  tree: ProllyTree<Code, Alg>,
): ProllyTree<Code, Alg> {
  // only care about tree.root property mutations, Buckets and Nodes of a tree should never be mutated
  return { ...tree };
}

/**
 *
 * @param blockstore - blockstore to use to fetch buckets
 * @param tree - ProllyTree to search
 * @param tuple - Tuple used to search for associated value
 *
 * @returns Associated Node if found, otherwise returns Tuple
 */
export async function* search<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  tuples: Tuple[],
): AsyncIterable<Node | Tuple> {
  tuples.sort(compareTuples);

  const cursor = createCursor(blockstore, tree);

  while (tuples.length > 0) {
    // remove first tuple from tuples
    const [tuple] = tuples.splice(0, 1) as [Tuple];

    await cursor.ffw(tuple, 0);

    const node: Node = cursor.current();

    if (compareTuples(tuple, node) === 0) {
      yield node;
    } else {
      yield tuple;
    }
  }
}

export async function* insert<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  nodes: Node[],
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  return mutateTree(
    blockstore,
    tree,
    nodes.map((n): AddUpdate => ({ op: "add", value: n })),
  );
}

export async function* remove<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  tuples: Tuple[],
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  return mutateTree(
    blockstore,
    tree,
    tuples.map((t): RmUpdate => ({ op: "rm", value: t })),
  );
}
