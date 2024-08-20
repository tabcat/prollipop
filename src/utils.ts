import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { SyncMultihashHasher } from "multiformats/interface";
import { compare as compareBytes } from "uint8arrays";
import { TreeCodec, decodeBucket, encodeBucket } from "./codec.js";
import {
  errNotFound,
  unexpectedBucketHash,
  unexpectedBucketLevel,
} from "./errors.js";
import { DefaultBucket, DefaultProllyTree } from "./impls.js";
import { Bucket, Node, Prefix, ProllyTree } from "./interface.js";

/**
 * Returns the index of the first element to fail a test.
 * If no failure is found then it returns the length of the array.
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

export const findFailureOrLastIndex = <T>(
  array: Array<T>,
  test: (element: T) => boolean,
): number => {
  if (array.length === 0) {
    throw new TypeError("Received empty array.");
  }

  return Math.min(array.length - 1, findFailure(array, test));
};

/**
 * Returns a new prefix object set to a specific level.
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
  codec: TreeCodec<Code>,
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
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>,
): Promise<Bucket<Code, Alg>> {
  let bytes: Uint8Array;
  try {
    bytes = await blockstore.get(bucketDigestToCid(expectedPrefix)(hash));
  } catch (e) {
    if (e instanceof Error && e.message === "Not Found") {
      throw errNotFound();
    } else {
      throw e;
    }
  }

  const bucket = decodeBucket(bytes, codec, hasher);

  if (bucket.prefix.level !== expectedPrefix.level) {
    throw unexpectedBucketLevel(bucket.prefix.level, expectedPrefix.level);
  }

  if (compareBytes(hash, bucket.getHash()) !== 0) {
    throw unexpectedBucketHash();
  }

  return bucket;
}

export interface InitOptions {
  averageBucketSize: number;
}

export function createEmptyTree<Code extends number, Alg extends number>(
  codec: TreeCodec<Code>,
  hasher: SyncMultihashHasher<Alg>,
  options: InitOptions,
): ProllyTree<Code, Alg> {
  /**
   * data which is prefixed to each bucket, only the level ever changes
   */
  const prefix: Prefix<Code, Alg> = {
    average: options.averageBucketSize,
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

/**
 * Creates a new NamedError class.
 *
 * @param name - Specifies the string to set as the .name property.
 * @returns
 */
export const createNamedErrorClass = <S extends string>(name: S) =>
  class NamedError extends Error {
    override readonly name: S;

    constructor(message?: string, options?: ErrorOptions) {
      super(message, options);
      this.name = name;
    }
  };
