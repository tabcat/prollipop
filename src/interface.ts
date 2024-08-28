import { CID } from "multiformats/cid";
import { SyncMultihashHasher } from "multiformats/interface";

export interface Tuple {
  readonly timestamp: number;
  readonly hash: Uint8Array;
}

export interface Node extends Tuple {
  readonly message: Uint8Array;
}

export interface Prefix<Code extends number, Alg extends number> {
  readonly average: number; // same for all buckets of the same tree
  readonly mc: Code; // same for all buckets of the same tree
  readonly mh: Alg; // same for all buckets of the same tree
  readonly level: number; // changes based on level of the bucket in the tree, leaves are always level 0
}

export interface Bucket<Code extends number, Alg extends number> {
  readonly prefix: Prefix<Code, Alg>;
  readonly nodes: Node[];
  getBytes(): Uint8Array;
  getCID(): CID;
  getHash(): Uint8Array;
}

export interface ProllyTree<Code extends number, Alg extends number> {
  getHasher(): SyncMultihashHasher<Alg>;
  root: Bucket<Code, Alg>;
}
