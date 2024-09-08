import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { Bucket, Node, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";

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

  toString() {
    return `N:t:${this.timestamp}:h:${base32.encode(this.hash)}:m:${base32.encode(this.message)}`;
  }
}

export class DefaultBucket implements Bucket {
  #bytes: Uint8Array;
  #digest: Uint8Array;

  constructor(
    readonly average: number,
    readonly level: number,
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
      average: this.average,
      level: this.level,
      nodes: this.nodes,
      hash: base32.encode(this.#digest),
    };
  }

  toString() {
    return `B:a:${this.average}:l:${this.level}:h:${base32.encode(this.#digest)}`;
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: Bucket) {}
}
