import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { Bucket, Node, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";

const nodeInspectSymbol = Symbol.for("nodejs.util.inspect.custom");

export class DefaultNode implements Node {
  constructor(
    readonly seq: Node["seq"],
    readonly key: Node["key"],
    readonly val: Node["val"],
  ) {}

  [nodeInspectSymbol]() {
    return {
      timestamp: this.seq,
      hash: base32.encode(this.key),
      message: base32.encode(this.val),
    };
  }

  toString() {
    return `N:t:${this.seq}:h:${base32.encode(this.key)}:m:${base32.encode(this.val)}`;
  }
}

export class DefaultBucket implements Bucket {
  #bytes: Uint8Array;
  #digest: Uint8Array;

  constructor(
    readonly average: number,
    readonly level: number,
    readonly entries: Node[],
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
    return this.entries[this.entries.length - 1] ?? null;
  }

  getParentNode(): Node | null {
    const { seq: timestamp, key: hash } = this.getBoundary() ?? {};
    return timestamp != null && hash != null
      ? new DefaultNode(timestamp, hash, this.getDigest())
      : null;
  }

  [nodeInspectSymbol]() {
    return {
      average: this.average,
      level: this.level,
      nodes: this.entries,
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
