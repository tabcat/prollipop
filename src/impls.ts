import { lastElement } from "@tabcat/ith-element";
import { base32 } from "multiformats/bases/base32";
import { Addressed, Bucket, Context, Entry, ProllyTree } from "./interface.js";

const nodeInspectSymbol = Symbol.for("entryjs.util.inspect.custom");

export const entriesToDeltaBase = (entries: Entry[]): number =>
  entries.length > 0 ? lastElement(entries).seq : 0;

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
    return `N:s:${this.seq}:k:${base32.encode(this.key)}:v:${base32.encode(this.val)}`;
  }
}

export class DefaultBucket implements Bucket {
  readonly base: number;
  #addressed: Addressed;
  #context: Context;

  constructor(
    readonly average: number,
    readonly level: number,
    readonly entries: Entry[],
    addressed: Addressed,
    context: Context,
  ) {
    this.base = entriesToDeltaBase(entries);
    this.#addressed = addressed;
    this.#context = context;
  }

  getAddressed(): Addressed {
    return this.#addressed;
  }

  getContext(): Context {
    return this.#context;
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: Bucket) {}
}
