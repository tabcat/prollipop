import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";

export type Await<T> = Promise<T> | T;

export type AwaitIterable<T> = Iterable<T> | AsyncIterable<T>;

export type Key = Uint8Array;
export type Val = Uint8Array;

export interface Entry {
  readonly key: Key;
  readonly val: Val;
}

export type KeyLike = Entry | Key;

export type ComparableKey = Key | "MIN_KEY" | "MAX_KEY";

export interface KeyRange {
  0: ComparableKey;
  1: ComparableKey;
}

export interface Prefix {
  /**
   * Must be the same for all buckets of the same tree.
   */
  readonly average: number;

  /**
   * Changes based on the level of the bucket in the tree.
   * Leaves are always level 0.
   */
  readonly level: number;
}

export interface Bucket extends Prefix {
  /**
   * Array of Entry that is sorted and non-duplicate by key.
   */
  readonly entries: Entry[];

  getAddressed(): Addressed;
  getContext(): Context;

  getCID(): CID;
  getBytes(): Uint8Array;
}

export interface Addressed {
  /**
   * The serialized bucket.
   */
  readonly bytes: Uint8Array;
  /**
   * The digest of the bucket.
   */
  readonly digest: Uint8Array;
}

export interface Context {
  /**
   * Whether the bucket is the tail of the tree.
   */
  readonly isTail: boolean;
  /**
   * Whether the bucket is the head of the tree.
   */
  readonly isHead: boolean;
}

export interface ProllyTree {
  root: Bucket;
}

/**
 * A subset of the Blockstore interface for the cursor to fetch blocks.
 */
export type Blockfetcher = Pick<Blockstore, "get">;
