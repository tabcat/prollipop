import { lastElement } from "@tabcat/ith-element";
import { base32 } from "multiformats/bases/base32";
import {
  Addressed,
  AddressedBucket,
  Bucket,
  CommittedBucket,
  Context,
  Entry,
  ProllyTree,
} from "./interface.js";

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

  constructor(
    readonly average: number,
    readonly level: number,
    readonly entries: Entry[],
  ) {
    this.base = entriesToDeltaBase(entries);
  }

  getAddressed(): Addressed | undefined {
    return undefined;
  }

  getContext(): Context | undefined {
    return undefined;
  }
}

export class DefaultAddressedBucket
  extends DefaultBucket
  implements AddressedBucket
{
  #addressed: Addressed;

  constructor(
    average: number,
    level: number,
    entries: Entry[],
    addressed: Addressed,
  ) {
    super(average, level, entries);
    this.#addressed = addressed;
  }

  override getAddressed(): Addressed {
    return this.#addressed;
  }
}

export class DefaultCommittedBucket
  extends DefaultBucket
  implements CommittedBucket
{
  #addressed: Addressed;
  #context: Context;

  constructor(
    average: number,
    level: number,
    entries: Entry[],
    addressed: Addressed,
    context: Context,
  ) {
    super(average, level, entries);
    this.#addressed = addressed;
    this.#context = context;
  }

  override getAddressed(): Addressed {
    return this.#addressed;
  }

  override getContext(): Context {
    return this.#context;
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: CommittedBucket) {}
}
