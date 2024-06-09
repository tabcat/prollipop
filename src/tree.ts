import { MultihashDigest, SyncMultihashHasher } from "multiformats";
import { Bucket, Prefix, createEmptyBucket } from "./bucket";
import { averageBucketSize } from "./constants";
import { blockCodecPlus, type BlockCodecPlus } from "./codec.js";
import { code as cborCode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { sha256 as mh_sha256 } from "multiformats/hashes/sha2";
import { create as createMultihashDigest } from "multiformats/hashes/digest";

const cborEncoder = <T>() => blockCodecPlus<T>();
const sha256Hasher = (): SyncMultihashHasher<typeof mh_sha256.code> => ({
  ...mh_sha256,
  digest: (input: Uint8Array): MultihashDigest<typeof mh_sha256.code> =>
    createMultihashDigest(mh_sha256.code, sha256(input)),
});

export interface ProllyTree<T, C extends number, H extends number> {
  readonly codec: BlockCodecPlus<C, T>;
  readonly hasher: SyncMultihashHasher<H>;
  root: Bucket;
}

export class DefaultProllyTree<T, C extends number, H extends number>
  implements ProllyTree<T, C, H>
{
  constructor(
    public root: Bucket,
    readonly codec: BlockCodecPlus<C, T>,
    readonly hasher: SyncMultihashHasher<H>
  ) {}
}

export interface InitOptions {
  averageBucketSize?: number;
}

export function createEmptyTree<T, C extends number, H extends number>(
  codec: BlockCodecPlus<C, T>,
  hasher: SyncMultihashHasher<H>,
  options: InitOptions
): ProllyTree<T, C, H> {
  /**
   * data which is prefixed to each bucket, only the level ever changes
   */
  const prefix: Prefix = {
    level: 0,
    average: options.averageBucketSize ?? averageBucketSize,
    mc: codec.code,
    mh: hasher.code,
  };

  return new DefaultProllyTree(
    createEmptyBucket(prefix, codec, hasher),
    codec,
    hasher
  );
}

export function cloneTree<T, Code extends number, Alg extends number>(
  tree: ProllyTree<T, Code, Alg>
): ProllyTree<T, Code, Alg> {
  // only care about tree.root mutations, Buckets and Nodes of a tree should never be mutated
  return { ...tree };
}

export function init<T>(
  options: InitOptions = {}
): ProllyTree<T, typeof cborCode, typeof mh_sha256.code> {
  return createEmptyTree(cborEncoder(), sha256Hasher(), options);
}
