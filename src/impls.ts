import { lastElement } from "@tabcat/ith-element";
import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { TupleRange } from "./codec.js";
import { Addressed, Bucket, Context, Entry, ProllyTree } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";

export const entriesToDeltaBase = (entries: Entry[]): number =>
  entries.length > 0 ? lastElement(entries).seq : 0;

export class DefaultEntry implements Entry {
  constructor(
    readonly seq: Entry["seq"],
    readonly key: Entry["key"],
    readonly val: Entry["val"],
  ) {}

  toString() {
    return `N:s:${this.seq}:k:${base32.encode(this.key)}:v:${base32.encode(this.val)}`;
  }
}

export class DefaultBucket implements Bucket {
  readonly base: number;
  #addressed: Addressed;
  #context: Context;
  #range: TupleRange;

  constructor(
    readonly average: number,
    readonly level: number,
    readonly entries: Entry[],
    addressed: Addressed,
    context: Context,
    range: TupleRange,
  ) {
    this.base = entriesToDeltaBase(entries);
    this.#addressed = addressed;
    this.#context = context;
    this.#range = range;
  }

  getAddressed(): Addressed {
    return this.#addressed;
  }

  getContext(): Context {
    return this.#context;
  }

  getRange(): TupleRange {
    return this.#range;
  }

  getCID(): CID {
    return bucketDigestToCid(this.getAddressed().digest);
  }

  getBytes(): Uint8Array {
    return this.getAddressed().bytes;
  }

  toString() {
    return `B:l:${this.level}:b:${this.base}:e:${this.entries.length}:d:${base32.encode(this.getAddressed().digest)}`;
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: Bucket) {}
}
