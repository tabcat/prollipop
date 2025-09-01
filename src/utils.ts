import { code as cborCode } from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import * as sha2 from "multiformats/hashes/sha2";
import { decodeBucket, encodeBucket, Expected } from "./codec.js";
import { compareKeys } from "./compare.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import {
  Blockfetcher,
  Bucket,
  Context,
  Entry,
  KeyLike,
  KeyRange,
  Prefix,
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

  return new DefaultEntry(boundary.key, bucket.getAddressed().digest);
};

export function getEntryRange(entries: Entry[]): KeyRange {
  return entries.length === 0
    ? ["MIN_KEY", "MAX_KEY"]
    : [entries[0]!.key, entries[entries.length - 1]!.key];
}

export function doRangesIntersect(range1: KeyRange, range2: KeyRange): boolean {
  return (
    compareKeys(range1[0], range2[1]) <= 0 &&
    compareKeys(range2[0], range1[1]) <= 0
  );
}

export const toKey = (entry: KeyLike): Uint8Array =>
  entry instanceof Uint8Array ? entry : entry.key;

/**
 * Returns a new prefix for the provided bucket or prefix.
 *
 * @param prefix
 * @returns
 */
export const bucketToPrefix = ({ average, level }: Prefix): Prefix => ({
  average,
  level,
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
  blockstore: Blockfetcher,
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
