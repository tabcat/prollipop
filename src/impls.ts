import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { Addressed, Bucket, Context, Entry, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";

export class DefaultEntry implements Entry {
  constructor(
    readonly key: Entry["key"],
    readonly val: Entry["val"],
  ) {}

  toString() {
    return `N::k:${base32.encode(this.key)}:v:${base32.encode(this.val)}`;
  }
}

export class DefaultBucket implements Bucket {
  #addressed: Addressed;
  #context: Context;

  constructor(
    readonly average: number,
    readonly level: number,
    readonly entries: Entry[],
    addressed: Addressed,
    context: Context,
  ) {
    this.#addressed = addressed;
    this.#context = context;
  }

  getAddressed(): Addressed {
    return this.#addressed;
  }

  getContext(): Context {
    return this.#context;
  }

  getCID(): CID {
    return bucketDigestToCid(this.getAddressed().digest);
  }

  getBytes(): Uint8Array {
    return this.getAddressed().bytes;
  }

  toString() {
    return `B:l:${this.level}:e:${this.entries.length}:d:${base32.encode(this.getAddressed().digest)}`;
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: Bucket) {}
}
