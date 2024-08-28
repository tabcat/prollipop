import { Blockstore } from "interface-blockstore";
import { SyncMultihashHasher } from "multiformats/interface";
import { compare as compareBytes } from "uint8arrays";
import { decodeBucket, encodeBucket } from "./codec.js";
import { DefaultBucket } from "./impls.js";
import { Bucket, Node, Prefix, Tuple } from "./interface.js";
import { bucketBytesToDigest, bucketDigestToCid } from "./internal.js";

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
export const createBucket = <Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  nodes: Node[],
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> => {
  const bytes = encodeBucket(prefix, nodes);
  return new DefaultBucket(
    prefix,
    nodes,
    bytes,
    bucketBytesToDigest(bytes, hasher),
  );
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
export async function loadBucket<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  hash: Uint8Array,
  expectedPrefix: Prefix<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Promise<Bucket<Code, Alg>> {
  let bytes: Uint8Array;
  try {
    bytes = await blockstore.get(bucketDigestToCid(expectedPrefix)(hash));
  } catch (e) {
    if (e instanceof Error && e.message === "Not Found") {
      throw new Error("Bucket not found in blockstore.", { cause: e });
    } else {
      throw new Error("Unable to fetch bucket from blockstore.", { cause: e });
    }
  }

  const bucket: Bucket<Code, Alg> = decodeBucket(bytes, hasher);

  if (bucket.prefix.level !== expectedPrefix.level) {
    throw new TypeError(
      `Expect prefix to have level ${expectedPrefix.level}. Received prefix with level ${bucket.prefix.level}`,
    );
  }

  if (compareBytes(hash, bucket.getHash()) !== 0) {
    throw new Error("Unexpected bucket hash.");
  }

  return bucket;
}
