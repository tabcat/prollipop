import { CID } from "multiformats/cid";

export interface Tuple {
  readonly seq: number;
  readonly key: Uint8Array;
}

export interface Node extends Tuple {
  readonly val: Uint8Array;
}

export interface Prefix {
  readonly average: number; // same for all buckets of the same tree
  readonly level: number; // changes based on level of the bucket in the tree, leaves are always level 0
}

export interface Bucket extends Prefix {
  readonly entries: Node[];
  getBytes(): Uint8Array;
  getCID(): CID;
  getDigest(): Uint8Array;
  getBoundary(): Node | null; // null if bucket is empty
  getParentNode(): Node | null;
}

export interface ProllyTree {
  root: Bucket;
}
