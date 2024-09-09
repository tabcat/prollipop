import { code as cborCode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import * as sha2 from "multiformats/hashes/sha2";
import { compare as compareBytes } from "uint8arrays";
import { decodeBucket, encodeBucket } from "./codec.js";
import { DefaultBucket } from "./impls.js";
import { Bucket, Node, Prefix, Tuple } from "./interface.js";

export const bucketDigestToCid = (digest: Uint8Array): CID =>
  CID.createV1(cborCode, createMultihashDigest(sha2.sha256.code, digest));

/**
 * Returns a new tuple for the provided node or tuple.
 *
 * @param node
 * @returns
 */
export const nodeToTuple = ({ timestamp, hash }: Node | Tuple): Tuple => ({
  timestamp,
  hash,
});

export const bucketToPrefix = ({ average, level }: Bucket): Prefix => ({
  average,
  level,
});

/**
 * Creates a new bucket from the provided nodes. Does not handle boundary creation.
 * This is a low level function and is easy to use incorrectly.
 *
 * @param prefix
 * @param nodes
 * @param codec
 * @param hasher
 * @returns
 */
export const createBucket = (
  average: number,
  level: number,
  nodes: Node[],
): Bucket => {
  const bytes = encodeBucket(average, level, nodes);
  return new DefaultBucket(average, level, nodes, bytes, sha256(bytes));
};

/**
 * Fetches a bucket from the provided blockstore.
 *
 * @param blockstore
 * @param hash
 * @param expectedPrefix
 * @param codec
 * @param hasher
 * @returns
 */
export async function loadBucket(
  blockstore: Blockstore,
  hash: Uint8Array,
  expectedPrefix: Prefix,
): Promise<Bucket> {
  let bytes: Uint8Array;
  try {
    bytes = await blockstore.get(bucketDigestToCid(hash));
  } catch (e) {
    if (e instanceof Error && e.message === "Not Found") {
      throw new Error("Bucket not found in blockstore.", { cause: e });
    } else {
      throw new Error("Unable to fetch bucket from blockstore.", { cause: e });
    }
  }

  const bucket: Bucket = decodeBucket(bytes);

  if (bucket.average !== expectedPrefix.average) {
    throw new TypeError(
      `Expect prefix to have average ${expectedPrefix.average}. Received prefix with average ${bucket.average}`,
    );
  }

  if (bucket.level !== expectedPrefix.level) {
    throw new TypeError(
      `Expect prefix to have level ${expectedPrefix.level}. Received prefix with level ${bucket.level}`,
    );
  }

  if (compareBytes(hash, bucket.getDigest()) !== 0) {
    throw new Error("Unexpected bucket hash.");
  }

  return bucket;
}
