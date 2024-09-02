import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { Bucket, Node, Prefix, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./internal.js";

const nodeInspectSymbol = Symbol.for("nodejs.util.inspect.custom");

export class DefaultNode implements Node {
  constructor(
    readonly timestamp: Node["timestamp"],
    readonly hash: Node["hash"],
    readonly message: Node["message"],
  ) {}

  [nodeInspectSymbol]() {
    return {
      timestamp: this.timestamp,
      hash: base32.encode(this.hash),
      message: base32.encode(this.message),
    };
  }

  get [Symbol.toStringTag]() {
    return JSON.stringify(this[nodeInspectSymbol]());
  }
}

export class DefaultBucket implements Bucket {
  #bytes: Uint8Array;
  #digest: Uint8Array;

  constructor(
    readonly prefix: Prefix,
    readonly nodes: Node[],
    bytes: Uint8Array,
    digest: Uint8Array,
  ) {
    this.#bytes = bytes;
    this.#digest = digest;
  }

  getBytes(): Uint8Array {
    return this.#bytes;
  }

  getDigest(): Uint8Array {
    return this.#digest;
  }

  getCID(): CID {
    return bucketDigestToCid(this.getDigest());
  }

  getBoundary(): Node | null {
    return this.nodes[this.nodes.length - 1] ?? null;
  }

  getParentNode(): Node | null {
    const { timestamp, hash } = this.getBoundary() ?? {};
    return timestamp != null && hash != null
      ? new DefaultNode(timestamp, hash, this.getDigest())
      : null;
  }

  [nodeInspectSymbol]() {
    return {
      prefix: this.prefix,
      nodes: this.nodes,
      hash: base32.encode(this.#digest),
    };
  }

  get [Symbol.toStringTag]() {
    return JSON.stringify(this[nodeInspectSymbol]());
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: Bucket) {}
}
