import { code as cborCode } from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import * as sha2 from "multiformats/hashes/sha2";
import { decodeBucket, encodeBucket, Expected } from "./codec.js";
import { compareTuples } from "./compare.js";
import { MAX_TUPLE, MIN_TUPLE } from "./constants.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import {
  Blockgetter,
  Bucket,
  Context,
  Entry,
  Prefix,
  Tuple,
  TupleRange,
} from "./interface.js";

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

export const getBucketBoundary = (bucket: Bucket): Entry | null =>
  bucket.entries.length > 0 ? bucket.entries[bucket.entries.length - 1]! : null;

export const getBucketEntry = (bucket: Bucket): Entry | null => {
  const boundary = getBucketBoundary(bucket);

  if (boundary == null) {
    return null;
  }

  return new DefaultEntry(
    boundary.seq,
    boundary.key,
    bucket.getAddressed().digest,
  );
};

export function getEntryRange(entries: Entry[]): TupleRange {
  return entries.length === 0
    ? [MIN_TUPLE, MAX_TUPLE]
    : [entryToTuple(entries[0]!), entryToTuple(entries[entries.length - 1]!)];
}

export function doRangesIntersect(
  range1: TupleRange,
  range2: TupleRange,
): boolean {
  return (
    compareTuples(range1[0], range2[1]) <= 0 &&
    compareTuples(range2[0], range1[1]) <= 0
  );
}

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

export const createBucket = (
  average: number,
  level: number,
  entries: Entry[],
  context: Context,
): Bucket => {
  const addressed = encodeBucket(average, level, entries, context);
  return new DefaultBucket(average, level, entries, addressed, context);
};

export const createEmptyBucket = (average: number): Bucket => {
  const entries: Entry[] = [];
  const context: Context = { isTail: true, isHead: true };
  return createBucket(average, 0, entries, context);
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
  blockstore: Blockgetter,
  digest: Uint8Array,
  context: Context,
  expected?: Expected,
): Promise<Bucket> {
  let bytes: Uint8Array;
  try {
    // expect the blockstore to check the digest
    bytes = await blockstore.get(bucketDigestToCid(digest));
  } catch (e) {
    if (e instanceof Error && e.message === "Not Found") {
      throw new Error("Bucket not found in blockstore.", { cause: e });
    } else {
      throw new Error("Unable to fetch bucket from blockstore.", { cause: e });
    }
  }

  const bucket = decodeBucket({ bytes, digest }, context, expected);

  return bucket;
}
