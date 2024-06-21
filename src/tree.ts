import { MultihashDigest, SyncMultihashHasher } from "multiformats";
import { Bucket, Prefix, createEmptyBucket } from "./bucket";
import { cborTreeCodec, type TreeCodec } from "./codec.js";
import { code as cborCode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { sha256 as mh_sha256 } from "multiformats/hashes/sha2";
import { create as createMultihashDigest } from "multiformats/hashes/digest";

const sha256Hasher = (): SyncMultihashHasher<typeof mh_sha256.code> => ({
  ...mh_sha256,
  digest: (input: Uint8Array): MultihashDigest<typeof mh_sha256.code> =>
    createMultihashDigest(mh_sha256.code, sha256(input)),
});

export interface ProllyTree<Code extends number, Alg extends number> {
  readonly codec: TreeCodec<Code, Alg>;
  readonly hasher: SyncMultihashHasher<Alg>;
  root: Bucket<Code, Alg>;
}

export class DefaultProllyTree<Code extends number, Alg extends number>
  implements ProllyTree<Code, Alg>
{
  constructor(
    public root: Bucket<Code, Alg>,
    readonly codec: TreeCodec<Code, Alg>,
    readonly hasher: SyncMultihashHasher<Alg>,
  ) {}
}

export interface InitOptions {
  averageBucketSize?: number;
}

export function createEmptyTree<T, Code extends number, Alg extends number>(
  codec: TreeCodec<Code, Alg>,
  hasher: SyncMultihashHasher<Alg>,
  options: InitOptions,
): ProllyTree<Code, Alg> {
  /**
   * data which is prefixed to each bucket, only the level ever changes
   */
  const prefix: Prefix<Code, Alg> = {
    level: 0,
    average: options.averageBucketSize ?? 30,
    mc: codec.code,
    mh: hasher.code,
  };

  return new DefaultProllyTree(
    createEmptyBucket(prefix, codec, hasher),
    codec,
    hasher,
  );
}

export function cloneTree<T, Code extends number, Alg extends number>(
  tree: ProllyTree<Code, Alg>,
): ProllyTree<Code, Alg> {
  // only care about tree.root mutations, Buckets and Nodes of a tree should never be mutated
  return { ...tree };
}

export function init<T>(
  options: InitOptions = {},
): ProllyTree<typeof cborCode, typeof mh_sha256.code> {
  return createEmptyTree(cborTreeCodec(), sha256Hasher(), options);
}
