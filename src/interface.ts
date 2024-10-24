import { CID } from "multiformats/cid";

export interface Tuple {
  readonly seq: number;
  readonly key: Uint8Array;
}

export interface Entry extends Tuple {
  readonly val: Uint8Array;
}

export interface Prefix {
  readonly average: number; // same for all buckets of the same tree
  readonly level: number; // changes based on level of the bucket in the tree, leaves are always level 0
  readonly base: number; // base number for delta encoding of entry seq field
}

export interface Bucket extends Prefix {
  readonly entries: Entry[];
  getBytes(): Uint8Array;
  getCID(): CID;
  getDigest(): Uint8Array;
  getBoundary(): Entry | null; // null if bucket is empty
  getParentEntry(): Entry | null;
}

export interface ProllyTree {
  root: Bucket;
}
