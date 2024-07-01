import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { ByteView, SyncMultihashHasher } from "multiformats/interface";
import { compare as compareBytes } from "uint8arrays";
import {
  EncodedBucket,
  TreeCodec,
  decodeBucket,
  encodeBucket,
} from "./codec.js";
import { DefaultBucket, DefaultProllyTree } from "./impls.js";
import { Bucket, Node, Prefix, ProllyTree, Tuple } from "./interface.js";

/**
 * Returns the reverse as a new array.
 *
 * @param array
 * @returns
 */
export const toReversed = <T>(array: Array<T>): Array<T> => {
  const newArray = Array.from(array);
  newArray.reverse();
  return newArray;
};

/**
 * Returns the index of the first element to fail a test.
 * If no failure is found then return the length of the array.
 *
 * @param array
 * @param test
 * @returns
 */
export const findFailure = <T>(
  array: Array<T>,
  test: (element: T) => boolean,
): number => {
  let i = 0;

  for (const element of array) {
    if (test(element) === false) {
      return i;
    }

    i++;
  }

  return i;
};

/**
 * Returns a copied prefix at a specific level.
 *
 * @param prefix
 * @param level
 * @returns
 */
export const prefixWithLevel = <Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  level: number,
): Prefix<Code, Alg> => ({
  ...prefix,
  level,
});

export const matchingPrefixes =
  <Code extends number, Alg extends number>(
    codec?: TreeCodec<Code, Alg>,
    hasher?: SyncMultihashHasher<Alg>,
  ) =>
  (prefix: Prefix<Code, Alg>): boolean =>
    (codec == null || codec.code === prefix.mc) &&
    (hasher == null || hasher.code === prefix.mh);

export const extractTuple = ({ timestamp, hash }: Tuple): Tuple => ({
  timestamp,
  hash,
});

export const bucketDigestToCid =
  <Code extends number, Alg extends number>(prefix: Prefix<Code, Alg>) =>
  (digest: Uint8Array): CID =>
    CID.createV1(prefix.mc, createMultihashDigest(prefix.mh, digest));

export const bucketCidToDigest = (cid: CID): Uint8Array => cid.multihash.digest;

export const bucketBytesToDigest = <Alg extends number>(
  bytes: Uint8Array,
  hasher: SyncMultihashHasher<Alg>,
): Uint8Array => hasher.digest(bytes).digest;

export const createBucket = <Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  nodes: Node[],
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Bucket<Code, Alg> => {
  const bytes = encodeBucket(prefix, nodes, codec);
  return new DefaultBucket(
    prefix,
    nodes,
    bytes,
    bucketBytesToDigest(bytes, hasher),
  );
};

export async function loadBucket<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  hash: Uint8Array,
  expectedPrefix: Prefix<Code, Alg>,
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
): Promise<Bucket<Code, Alg>> {
  let bytes: ByteView<EncodedBucket<Code, Alg>>;
  try {
    bytes = await blockstore.get(bucketDigestToCid(expectedPrefix)(hash));
  } catch {
    throw new Error("data for bucket cid is missing");
  }

  let bucket: Bucket<Code, Alg>;
  try {
    bucket = decodeBucket(bytes, codec, hasher);
  } catch {
    throw new Error("failed to decode bucket");
  }

  if (compareBytes(hash, bucket.getHash()) !== 0) {
    throw new Error("mismatched hash");
  }

  if (
    expectedPrefix.average !== bucket.prefix.average ||
    expectedPrefix.level !== bucket.prefix.level ||
    expectedPrefix.mc !== bucket.prefix.mc ||
    expectedPrefix.mh !== bucket.prefix.mh
  ) {
    throw new Error("bucket has unexpected prefix");
  }

  return bucket;
}

export interface InitOptions {
  averageBucketSize: number;
}

export function createEmptyTree<Code extends number, Alg extends number>(
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
  options: InitOptions,
): ProllyTree<Code, Alg> {
  /**
   * data which is prefixed to each bucket, only the level ever changes
   */
  const prefix: Prefix<Code, Alg> = {
    level: 0,
    average: options.averageBucketSize,
    mc: codec.code,
    mh: hasher.code,
  };

  return new DefaultProllyTree(
    createBucket(prefix, [], codec, hasher),
    codec,
    hasher,
  );
}
