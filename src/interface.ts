import { CID } from "multiformats/cid";
import { TupleRange } from "./codec.js";

export interface Tuple {
  /**
   * Sequence number. Can be used to attach order to the key.
   */
  readonly seq: number;
  readonly key: Uint8Array;
}

export interface Entry extends Tuple {
  readonly val: Uint8Array;
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

  /**
   * Base number for delta encoding.
   * Set to boundary seq, 0 if the bucket is empty.
   */
  readonly base: number;
}

export interface Bucket extends Prefix {
  /**
   * Array of Entry that is sorted and non-duplicate by Tuple.
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
 * A cursor enables ordered traversal of a prolly-tree.
 */
export interface Cursor {
  /**
   * Returns the current level of the cursor.
   */
  level(): number;
  /**
   * Returns the root level of the tree.
   */
  rootLevel(): number;

  /**
   * Returns the index of the current entry in the bucket. If index is -1 the bucket is empty and current() will throw an error.
   */
  index(): number;
  /**
   * Returns the current entry in the bucket. If the bucket is empty this method will throw an error.
   */
  current(): Entry;

  /**
   * Returns an array of buckets from root to current level.
   */
  buckets(): Bucket[];
  /**
   * Returns the current bucket. The last bucket in the array returned by the buckets() method.
   */
  currentBucket(): Bucket;

  /**
   * Moves the cursor to the next tuple on the current level.
   */
  next(level?: number): Promise<void>;

  /**
   * Moves the cursor to the beginning of the next bucket on the current level.
   */
  nextBucket(level?: number): Promise<void>;

  /**
   * Moves the cursor to the next tuple on the current level.
   * If the supplied tuple is less than or equal to the current tuple, the cursor will not be moved.
   */
  nextTuple(tuple: Tuple, level?: number): Promise<void>;

  /**
   * Jumps the cursor from root to the tuple or parent tuple at level. This is not a move operation.
   */
  jumpTo(tuple: Tuple, level?: number): Promise<void>;

  /**
   * Returns true or false depending on whether the cursor is at the tail bucket for the level.
   */
  isAtTail(): boolean;
  /**
   * Returns true or false depending on whether the cursor is at the head bucket for the level.
   */
  isAtHead(): boolean;

  /**
   * Returns the range of the current bucket.
   */
  range(): TupleRange;

  /**
   * Returns true or false depending on whether the cursor is currently being incremented.
   */
  locked(): boolean;
  /**
   * Returns true or false depending on whether the cursor has reached the end of the tree.
   */
  done(): boolean;

  /**
   * Returns a clone of the cursor instance.
   */
  clone(): Cursor;
}
