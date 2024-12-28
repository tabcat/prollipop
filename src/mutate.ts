import { firstElement, lastElement } from "@tabcat/ith-element";
import { union } from "@tabcat/sorted-sets/union";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import { compare as compareBytes } from "uint8arrays";
import { IsBoundary, createIsBoundary } from "./boundary.js";
import { encodeBucket } from "./codec.js";
import {
  compareBoundaries,
  compareBucketDiffs,
  compareBuckets,
  compareTuples,
} from "./compare.js";
import { MAX_LEVEL } from "./constants.js";
import { createCursor } from "./cursor.js";
import {
  BucketDiff,
  EntryDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import {
  Bucket,
  Context,
  Cursor,
  Entry,
  ProllyTree,
  Tuple,
} from "./interface.js";
import {
  AwaitIterable,
  createReusableAwaitIterable,
  ensureSortedTuplesIterable,
  getBucketBoundary,
  getBucketEntry,
} from "./utils.js";

/**
 * An update is made of a Tuple, an Entry, or an Entry with a `strict: true` property.
 * Tuples will result in a remove.
 * Entries will result in an add.
 * Entries with a `strict: true` property will conditionally result in a remove:
 * if the update.val and the entry.val fields match.
 */
export type Update = Tuple | Entry | (Entry & { strict: true });

export const exclusiveMax = <T>(
  array: T[],
  boundary: T,
  compare: (a: T, b: T) => number,
) => {
  const index = array.findIndex((x) => compare(x, boundary) > 0);

  return index === -1 ? array.length : index;
};

/**
 * Takes an entry and update of equal tuples and returns whether a change must be made.
 *
 * @param entry
 * @param update
 * @returns
 */
export const applyUpdate = (
  entry: Entry | null,
  update: Update | null,
): [Entry | null, EntryDiff | null] => {
  if (update == null) {
    return [entry, null];
  }

  if ("val" in update && !("strict" in update)) {
    // add updates
    const updateEntry = new DefaultEntry(update.seq, update.key, update.val);

    if (entry != null) {
      if (compareBytes(entry.val, update.val) !== 0) {
        return [updateEntry, [entry, updateEntry]];
      } else {
        return [entry, null];
      }
    } else {
      return [updateEntry, [null, updateEntry]];
    }
  } else {
    // rm updates
    if (entry != null) {
      if ("strict" in update && compareBytes(entry.val, update.val) !== 0) {
        return [entry, null];
      }

      return [null, [entry, null]];
    } else {
      return [null, null];
    }
  }
};

export async function getUserUpdateTuple(
  updts: Updts,
  level: number,
): Promise<Tuple | null> {
  if (level === 0) {
    for await (const u of updts.user) {
      updts.current.push(...u);
      return firstElement(u);
    }
  }

  return null;
}

/**
 * Returns the updatee for the leftovers or tuple, also returns whether the updatee is a tail or head bucket.
 * Returns a null updatee if the level is greater than the cursor's root level.
 *
 * @param cursor
 * @param leftovers
 * @param tuple
 * @param level
 * @returns
 */
export async function getUpdatee(
  cursor: Cursor,
  leftovers: Entry[],
  tuple: Tuple,
  average: number,
  level: number,
): Promise<Bucket> {
  if (leftovers[0] != null) {
    await cursor.nextBucket();
    return cursor.currentBucket();
  }

  if (level > cursor.rootLevel()) {
    // fake root bucket for levels above the root of the original tree
    return new DefaultBucket(
      average,
      level,
      [],
      {
        bytes: new Uint8Array(0),
        digest: new Uint8Array(0),
      },
      {
        isTail: true,
        isHead: true,
      },
    );
  } else {
    if (level === cursor.level()) {
      await cursor.nextTuple(tuple);
    } else {
      await cursor.jumpTo(tuple, level);
    }

    return cursor.currentBucket();
  }
}

/**
 * Collects the updates from updts.user and adds them to updts.current.
 * Does this until a collected update is >= boundary.
 *
 * @param boundary
 * @param updts
 * @param isHead
 * @returns
 */
export async function collectUpdates(
  boundary: Tuple | null,
  updts: Updts,
  isHead: boolean,
): Promise<void> {
  // only stop collecting updates if isHead is false and
  // the last current update is gte to updatee boundary
  const stop = () =>
    // boundary only null if empty bucket (isHead === true)
    !isHead && compareTuples(lastElement(updts.current), boundary!) >= 0;

  if (stop()) {
    // already have enough updates
    return;
  }

  for await (const u of updts.user) {
    updts.current.push(...u);
    if (stop()) break;
  }
}

export interface Updts {
  /**
   * The user provided updates. Applied to level 0.
   */
  user: AwaitIterable<Update[]>;

  /**
   * The updates to be applied to the current level.
   */
  current: Update[];

  /**
   * The updates to be applied to the next level.
   */
  next: Update[];
}

export interface State {
  /**
   * Tracks new root of the tree.
   */
  newRoot: Bucket | null;

  /**
   * Tracks removed buckets.
   */
  removedBuckets: Bucket[];
}

/**
 * Returns a bucket with the given entries.
 * If the entries are the same as the original bucket's entries then the original bucket is returned.
 *
 * @param original - The original bucket to be rebuilt.
 * @param entries - Entries of the new bucket.
 * @returns A bucket with the given entries.
 */
export const getBucket = (
  original: Bucket,
  entries: Entry[],
  context: Context,
): Bucket => {
  const { average, level } = original;
  const addressed = encodeBucket(average, level, entries, context);
  const bucket = new DefaultBucket(average, level, entries, addressed, context);

  // can probably compare entryDiffs.length and entries.length with original.entries.length
  // this is safer
  return compareBytes(
    bucket.getAddressed().digest,
    original.getAddressed().digest,
  ) === 0
    ? original
    : bucket;
};

/**
 * Rebuilds a bucket from the given updates.
 *
 * The `bucket` must end in a boundary or be a head, otherwise this will throw an error.
 * The `leftovers` array must be empty or contain entries which precede any entries inside `bucket`.
 * If no updates result in changes to the bucket, the same bucket reference is returned.
 * If `isHead` is true, no leftover entries will be returned.
 * If no updates affect the bucket boundary then `buckets.length` will be 1.
 * If a boundary is added by an add update then `buckets.length` will be +1.
 * If a boundary is removed by an rm update then `buckets.length` will be -1.
 * It writes +1 to `bucketsRebuilt` for each bucket rebuilt.
 *
 * @param bucket - The original bucket to be rebuilt.
 * @param leftovers - Entries that were not included in the previous bucket.
 * @param updates - Updates to be applied to the bucket.
 * @param isHead - Indicates if the bucket is the level head.
 * @param isBoundary - Function to determine if an entry is a boundary.
 * @returns A tuple containing the rebuilt buckets, leftover entries, and entry differences.
 */
export function rebuildBucket(
  bucket: Bucket,
  leftovers: Entry[],
  updates: Update[],
  visitedLevelTail: boolean,
  isHead: boolean,
  bucketsRebuilt: number,
  isBoundary: IsBoundary,
): [Bucket[], Entry[], EntryDiff[], boolean] {
  const bucketEntries: Entry[][] = [];
  let entries: Entry[] = leftovers;
  const diffs: EntryDiff[] = [];

  for (const [e, u] of pairwiseTraversal(
    bucket.entries,
    updates,
    compareTuples,
  )) {
    const [entry, entryDiff] = applyUpdate(e, u);

    entryDiff && diffs.push(entryDiff);

    if (entry != null) {
      entries.push(entry);
      if (isBoundary(entry)) {
        bucketEntries.push(entries);
        entries = [];
        bucketsRebuilt++;
      }
    }
  }

  // only create another bucket if isHead and there are entries or no buckets were rebuilt for the level yet.
  if (isHead && (entries.length > 0 || bucketsRebuilt === 0)) {
    bucketEntries.push(entries);
    bucketsRebuilt++;
  }

  const isNewRoot = bucketsRebuilt === 1 && visitedLevelTail && isHead;

  const buckets: Bucket[] = [];
  for (const [i, entries] of bucketEntries.entries()) {
    const last = i === bucketEntries.length - 1;
    buckets[i] = getBucket(bucket, entries, {
      isTail: last && isNewRoot,
      isHead: last && isHead,
    });
  }

  return [buckets, entries, diffs, isNewRoot];
}

/**
 * Rebuilds a level of the tree.
 *
 * Only yields diffs when the level is changed.
 * Entry diffs are only yielded on level 0.
 * Writes to the state.removedBuckets array if a level 0 bucket is changed/removed/added.
 * Writes to the state.newRoot if a new root is found.
 * A new root is found when the tail and head buckets were visited and only one bucket was rebuilt for the level.
 *
 * @param cursor - The cursor to the current tree.
 * @param updts - The state of the updates for the tree.
 * @param state - The state of the mutation.
 * @param level - The level to be rebuilt.
 * @param createIsBoundary - Function to determine if an entry is a boundary.
 * @returns
 */
export async function* rebuildLevel(
  cursor: Cursor,
  updts: Updts,
  state: State,
  average: number,
  level: number,
): AsyncIterable<ProllyTreeDiff> {
  let leftovers: Entry[] = [];
  const isBoundary = createIsBoundary(average, level);

  let visitedLevelTail: boolean = false;
  let bucketsRebuilt: number = 0;
  let updatedLevel: boolean = false;

  let d = createProllyTreeDiff();

  let tuple = updts.current[0] ?? (await getUserUpdateTuple(updts, level));

  while (tuple != null) {
    const updatee = await getUpdatee(cursor, leftovers, tuple, average, level);
    const { isTail, isHead } = updatee.getContext();
    const boundary = getBucketBoundary(updatee);

    visitedLevelTail = visitedLevelTail || isTail;

    if (level === 0) {
      await collectUpdates(boundary, updts, isHead);
    }

    let index = updts.current.length;
    if (!isHead) {
      index = exclusiveMax(updts.current, boundary!, compareTuples);
    }
    const updates = updts.current.splice(0, index);

    const [buckets, entries, entryDiffs, isNewRoot] = rebuildBucket(
      updatee,
      leftovers,
      updates,
      visitedLevelTail,
      isHead,
      bucketsRebuilt,
      isBoundary,
    );
    bucketsRebuilt += buckets.length;
    leftovers = entries;

    if (isNewRoot) {
      state.newRoot = buckets[0]!;
    }

    // there were changes
    if (buckets[0] !== updatee) {
      updatedLevel = true;

      if (level === 0) {
        // only add entry changes on level 0
        d.entries.push(...entryDiffs);

        // removed buckets union bucket path
        state.removedBuckets = Array.from(
          union(
            cursor.buckets().reverse(),
            state.removedBuckets,
            compareBuckets,
          ),
        );
      }

      // append updates for next level to updts.next
      for (const [rm, add] of pairwiseTraversal(
        updatee ? [updatee] : [],
        buckets,
        compareBoundaries,
      )) {
        // prioritize add updates
        const b = add ?? rm;
        const parentEntry = getBucketEntry(b);
        parentEntry && updts.next.push(parentEntry);
      }

      // just up to last bucket
      const removedBuckets = state.removedBuckets.splice(
        0,
        buckets.length > 0
          ? exclusiveMax(
              state.removedBuckets,
              lastElement(buckets),
              compareBoundaries,
            )
          : 0,
      );

      // add buckets to diff
      for (const [added, removed] of pairwiseTraversal(
        buckets,
        removedBuckets,
        compareBoundaries,
      )) {
        const diffs: BucketDiff[] = [];

        if (added != null) {
          diffs.push([null, added]);
        }

        if (removed != null) {
          diffs.push([removed, null]);
        }

        d.buckets.push(...diffs);
      }

      // only yield mid level when there are buckets built without leftovers
      // these are clean breaks
      // dont yield on isHead, yield after while loop
      if (buckets.length > 0 && leftovers.length === 0 && !isHead) {
        d.buckets.sort(compareBucketDiffs);
        yield d;
        d = createProllyTreeDiff();
      }
    }

    tuple = updts.current[0] ?? (await getUserUpdateTuple(updts, level));
  }

  // no updates to level
  if (!updatedLevel) {
    state.newRoot = firstElement(cursor.buckets());
    return;
  }

  // sort updates for next level, may be safely removed at some point when the tests are better
  updts.next.sort(compareTuples);

  let removed = 0;
  for (const b of state.removedBuckets) {
    if (b.level !== level) {
      break;
    }

    d.buckets.push([b, null]);
    removed++;
  }
  state.removedBuckets.splice(0, removed);

  if (state.newRoot != null) {
    // if new root found yield any removed buckets from higher levels
    if (state.removedBuckets.length > 0) {
      for (const b of state.removedBuckets) {
        d.buckets.push([b, null]);
      }
      state.removedBuckets = [];
    }

    updts.next.length = 0;
  }

  if (d.buckets.length > 0) {
    d.buckets.sort(compareBucketDiffs);
    yield d;
  }
}

export async function* mutate(
  blockstore: Blockstore,
  tree: ProllyTree,
  updates: AwaitIterable<Update[]>,
): AsyncIterable<ProllyTreeDiff> {
  let updts: Updts = {
    user: createReusableAwaitIterable(ensureSortedTuplesIterable(updates)),
    current: [],
    next: [],
  };

  let state: State = {
    newRoot: null,
    removedBuckets: [],
  };

  let level: number = 0;

  const cursor = createCursor(blockstore, tree);
  const { average } = cursor.currentBucket();

  while (state.newRoot == null && level < MAX_LEVEL) {
    yield* rebuildLevel(cursor, updts, state, average, level);

    level++;
    updts.current = updts.next;
    updts.next = [];
  }

  if (state.newRoot == null) {
    throw new Error("Reached max level without finding a new root.");
  }

  tree.root = state.newRoot;
}
