import { CID } from "multiformats/cid";
import { SyncMultihashHasher } from "multiformats/interface";
import { TreeCodec } from "./codec.js";
import { Bucket, Node, Prefix, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";
import { base32 } from "multiformats/bases/base32";

const nodeInspectSymbol = Symbol.for('nodejs.util.inspect.custom')

export class DefaultNode implements Node {
  constructor(
    readonly timestamp: Node["timestamp"],
    readonly hash: Node["hash"],
    readonly message: Node["message"],
  ) {}

  [nodeInspectSymbol] () {
    return {
      timestamp: this.timestamp,
      hash: base32.encode(this.hash),
      message: base32.encode(this.message)
    }
  }
}

export class DefaultBucket<Code extends number, Alg extends number>
  implements Bucket<Code, Alg>
{
  #bytes: Uint8Array;
  #hash: Uint8Array;

  constructor(
    readonly prefix: Prefix<Code, Alg>,
    readonly nodes: Node[],
    bytes: Uint8Array,
    hash: Uint8Array,
  ) {
    this.#bytes = bytes;
    this.#hash = hash;
  }

  getBytes(): Uint8Array {
    return this.#bytes;
  }

  getHash(): Uint8Array {
    return this.#hash;
  }

  getCID(): CID {
    return bucketDigestToCid(this.prefix)(this.getHash());
  }

  [nodeInspectSymbol] () {
    return {
      prefix: this.prefix,
      nodes: this.nodes,
      hash: base32.encode(this.#hash)
    }
  }
}

export class DefaultProllyTree<Code extends number, Alg extends number>
  implements ProllyTree<Code, Alg>
{
  #codec: TreeCodec<Code, Alg>;
  #hasher: SyncMultihashHasher<Alg>;

  constructor(
    public root: Bucket<Code, Alg>,
    codec: TreeCodec<Code, Alg>,
    hasher: SyncMultihashHasher<Alg>,
  ) {
    this.#codec = codec;
    this.#hasher = hasher;
  }

  getCodec(): TreeCodec<Code, Alg> {
    return this.#codec;
  }

  getHasher(): SyncMultihashHasher<Alg> {
    return this.#hasher;
  }
}
