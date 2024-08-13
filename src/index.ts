import * as dagCbor from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { decode, decodeFirst, encode } from "cborg";
import { Blockstore } from "interface-blockstore";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { sha256 as mh_sha256 } from "multiformats/hashes/sha2";
import { MultihashDigest, SyncMultihashHasher } from "multiformats/interface";
import { Update, mutateTree } from "./builder.js";
import { TreeCodec, handleBuffer } from "./codec.js";
import { compareTuples } from "./compare.js";
import { createCursorState, moveToTupleOnLevel, nodeOf } from "./cursor.js";
import { ProllyTreeDiff } from "./diff.js";
import { Node, ProllyTree, Tuple } from "./interface.js";
import { InitOptions, createEmptyTree } from "./utils.js";

export const cborTreeCodec: TreeCodec<
  typeof dagCbor.code,
  typeof mh_sha256.code
> = {
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

export type PartialInitOptions = Partial<InitOptions>;

export function init(
  options: PartialInitOptions = {},
): ProllyTree<typeof dagCbor.code, typeof mh_sha256.code> {
  const opts: InitOptions = {
    averageBucketSize: 30,
    ...options,
  };

  return createEmptyTree(cborTreeCodec, sha256SyncHasher, opts);
}

export function cloneTree<Code extends number, Alg extends number>(
  tree: ProllyTree<Code, Alg>,
): ProllyTree<Code, Alg> {
  // only care about tree.root mutations, Buckets and Nodes of a tree should never be mutated
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

  const cursorState = createCursorState(blockstore, tree);

  while (tuples.length > 0) {
    // remove first tuple from tuples
    const [tuple] = tuples.splice(0, 1) as [Tuple];

    await moveToTupleOnLevel(cursorState, tuple, 0);

    const node: Node = nodeOf(cursorState);

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
    nodes.map((n): Update<"add", 0> => ({ op: "add", level: 0, value: n })),
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
    tuples.map((t): Update<"rm", 0> => ({ op: "rm", level: 0, value: t })),
  );
}
