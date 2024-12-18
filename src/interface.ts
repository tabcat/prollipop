export interface Tuple {
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
  getContext(): Context | undefined;
  getAddressed(): Addressed | undefined;
}

export interface Addressed {
  readonly bytes: Uint8Array;
  readonly digest: Uint8Array;
}

export interface AddressedBucket extends Bucket {
  getAddressed(): Addressed;
}

export interface Context {
  readonly isTail: boolean;
  readonly isHead: boolean;
}

export interface CommittedBucket extends AddressedBucket {
  getContext(): Context;
}

export type TypedBucket<
  A extends Addressed | undefined,
  C extends Context | undefined,
> = A extends undefined
  ? Bucket
  : C extends undefined
    ? AddressedBucket
    : CommittedBucket;

export interface ProllyTree {
  root: CommittedBucket;
}
