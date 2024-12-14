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
}

export class DefaultAddressedBucket
  extends DefaultBucket
  implements AddressedBucket
{
  constructor(
    average: number,
    level: number,
    entries: Entry[],
    readonly addressed: Addressed,
  ) {
    super(average, level, entries);
  }
}

export class DefaultCommittedBucket
  extends DefaultBucket
  implements CommittedBucket
{
  constructor(
    average: number,
    level: number,
    entries: Entry[],
    readonly addressed: Addressed,
    readonly context: Context,
  ) {
    super(average, level, entries);
  }
}

export class DefaultProllyTree implements ProllyTree {
  constructor(public root: CommittedBucket) {}
}
