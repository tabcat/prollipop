import { code as cborCode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { ithElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import * as sha2 from "multiformats/hashes/sha2";
import { compare as compareBytes } from "uint8arrays";
import {
  CodecPredicates,
  TupleRange,
  decodeBucket,
  encodeBucket,
} from "./codec.js";
import { minTuple } from "./compare.js";
import { DefaultBucket } from "./impls.js";
import { Bucket, Entry, Prefix, Tuple } from "./interface.js";

export type Await<T> = Promise<T> | T;

export type AwaitIterable<T> = Iterable<T> | AsyncIterable<T>;

export const isPositiveInteger = (n: unknown): n is number =>
  typeof n === "number" && n >= 0 && Number.isInteger(n);

export const tupleRangeOfEntries = (entries: Entry[]): TupleRange => [
  minTuple,
  entries.length > 0 ? lastElement(entries) : minTuple,
];

export const tupleRangeOfChild = (
  entries: Entry[],
  index: number,
): TupleRange => {
  if (entries.length === 0) {
    return [minTuple, minTuple];
  }

  return [
    index === 0 ? minTuple : ithElement(entries, index - 1),
    ithElement(entries, index),
  ];
};

/**
 * Returns the CID for a given bucket digest.
 *
 * @param digest
 * @returns
 */
export const bucketDigestToCid = (digest: Uint8Array): CID =>
  CID.createV1(cborCode, createMultihashDigest(sha2.sha256.code, digest));

/**
 * Returns the digest for a given bucket CID.
 *
 * @param cid
 * @returns
 */
export const bucketCidToDigest = (cid: CID): Uint8Array => cid.multihash.digest;

/**
 * Returns a new tuple for the provided entry or tuple.
 *
 * @param entry
 * @returns
 */
export const entryToTuple = ({ seq, key }: Tuple): Tuple => ({
  seq,
  key,
});

/**
 * Returns a new prefix for the provided bucket or prefix.
 *
 * @param prefix
 * @returns
 */
export const bucketToPrefix = ({ average, level, base }: Prefix): Prefix => ({
  average,
  level,
  base,
});

export const entriesToDeltaBase = (entries: Entry[]): number =>
  entries.length > 0 ? lastElement(entries).seq : 0;

/**
 * Creates a new bucket from the provided entries. Does not handle boundary creation.
 * This is a low level function and is easy to use incorrectly.
 *
 * @param average
 * @param level
 * @param entries
 * @returns
 */
export const createBucket = (
  average: number,
  level: number,
  entries: Entry[],
  predicates: CodecPredicates,
): Bucket => {
  const bytes = encodeBucket(average, level, entries, predicates);
  return new DefaultBucket(average, level, entries, bytes, sha256(bytes));
};

/**
 * Fetches a bucket from the provided blockstore.
 *
 * @param blockstore
 * @param digest
 * @param expectedPrefix
 * @returns
 */
export async function loadBucket(
  blockstore: Blockstore,
  digest: Uint8Array,
  isHead: boolean,
  relation?: {
    parent: Bucket;
    child: number;
  },
): Promise<Bucket> {
  let bytes: Uint8Array;
  try {
    bytes = await blockstore.get(bucketDigestToCid(digest));
  } catch (e) {
    if (e instanceof Error && e.message === "Not Found") {
      throw new Error("Bucket not found in blockstore.", { cause: e });
    } else {
      throw new Error("Unable to fetch bucket from blockstore.", { cause: e });
    }
  }

  const predicates: CodecPredicates = {
    isHead,
    isRoot: true,
  };

  if (relation != null) {
    const { parent, child } = relation;
    predicates.isRoot = false;

    predicates.range = [
      child === 0 ? minTuple : entryToTuple(parent.entries[child - 1]!),
      entryToTuple(parent.entries[child]!),
    ];

    predicates.expectedPrefix = {
      average: parent.average,
      level: parent.level - 1,
      base: parent.entries[child]!.seq,
    };
  }

  const bucket: Bucket = decodeBucket(bytes, predicates);

  if (compareBytes(digest, bucket.getDigest()) !== 0) {
    throw new Error("Unexpected bucket digest.");
  }

  return bucket;
}
