import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { Bucket, Entry, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";

const nodeInspectSymbol = Symbol.for("entryjs.util.inspect.custom");

export class DefaultEntry implements Entry {
  constructor(
    readonly seq: Entry["seq"],
    readonly key: Entry["key"],
    readonly val: Entry["val"],
  ) {}

  [nodeInspectSymbol]() {
    return {
      seq: this.seq,
      key: base32.encode(this.key),
      val: base32.encode(this.val),
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
    readonly entries: Entry[],
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

  getBoundary(): Entry | null {
    return this.entries[this.entries.length - 1] ?? null;
  }

  getParentEntry(): Entry | null {
    const { seq, key } = this.getBoundary() ?? {};
    return seq != null && key != null
      ? new DefaultEntry(seq, key, this.getDigest())
      : null;
  }

  [nodeInspectSymbol]() {
    return {
      average: this.average,
      level: this.level,
      entries: this.entries,
      digest: base32.encode(this.#digest),
    };
  }

  toString() {
    return `B:a:${this.average}:l:${this.level}:h:${base32.encode(this.#digest)}`;
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: Bucket) {}
}
