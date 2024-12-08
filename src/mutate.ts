import { firstElement, lastElement } from "@tabcat/ith-element";
import { union } from "@tabcat/sorted-sets/union";
import { ensureSortedSet, pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import { compare as compareBytes } from "uint8arrays";
import { CreateIsBoundary, IsBoundary, createIsBoundary } from "./boundary.js";
import {
  compareBoundaries,
  compareBucketDiffs,
  compareBuckets,
  compareTuples,
} from "./compare.js";
import { MAX_LEVEL } from "./constants.js";
import { Cursor, createCursor } from "./cursor.js";
import {
  BucketDiff,
  EntryDiff,
  ProllyTreeDiff,
  createProllyTreeDiff,
} from "./diff.js";
import { DefaultEntry } from "./impls.js";
import { Bucket, Entry, ProllyTree, Tuple } from "./interface.js";
import { AwaitIterable, createBucket, entryToTuple } from "./utils.js";

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

export const handleArray = <T>(t: T | T[]): T[] => (Array.isArray(t) ? t : [t]);

/**
 * Takes a entry and update of equal tuples and returns whether a change must be made.
 * The entry may be null but the update will always be defined.
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

export async function getCurrentUpdateTuple(
  updts: Updts,
  level: number,
): Promise<Tuple | null> {
  if (updts.current[0] != null) {
    return updts.current[0];
  }

  if (level === 0) {
    for await (const u of updts.user) {
      const updates: Update[] = handleArray(u);

      if (updates.length === 0) {
        continue;
      }

      updts.current.push(...updates);
      return firstElement(updates);
    }
  }

  return null;
}

/**
 * Returns the updatee for the leftovers or tuple, also returns whether the updatee is a tail or head bucket.
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
  tuple: Tuple | null,
  level: number,
): Promise<[Bucket | null, boolean, boolean]> {
  if (leftovers[0] != null) {
    await cursor.nextBucket();
    return [cursor.currentBucket(), false, cursor.isAtHead()];
  }

  if (tuple == null) {
    return [null, false, false];
  }

  if (level > cursor.rootLevel()) {
    const { average } = cursor.currentBucket();
    return [
      createBucket(average, level, [], { isHead: true, isRoot: true }),
      true,
      true,
    ];
  } else {
    await cursor.jumpTo(tuple, level);
    return [cursor.currentBucket(), cursor.isAtTail(), cursor.isAtHead()];
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
  boundary: Tuple,
  updts: Updts,
  isHead: boolean,
): Promise<void> {
  // only stop collecting updates if isHead is false and
  // the last current update is gte to updatee boundary
  const stop = () =>
    !isHead && compareTuples(lastElement(updts.current), boundary) >= 0;

  if (stop()) {
    // already have enough updates
    return;
  }

  for await (const u of updts.user) {
    const updates: Update[] = handleArray(u);

    if (updates.length > 0) {
      updts.current.push(...updates);

      if (stop()) break;
    }
  }
}

export interface Updts {
  /**
   * The user provided updates. Applied to level 0.
   */
  user: AwaitIterable<Update | Update[]>;

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
  noBoundaryOrEmpty: boolean,
) => {
  const bucket = createBucket(original.average, original.level, entries, {
    isHead: noBoundaryOrEmpty,
    isRoot: noBoundaryOrEmpty,
  });

  // can probably compare entryDiffs.length and entries.length with original.entries.length
  // this is safer
  return compareBytes(bucket.getDigest(), original.getDigest()) === 0
    ? original
    : bucket;
};

export const getRemovedBuckets = () => {};

/**
 * Rebuilds a bucket from the given updates.
 *
 * @remarks
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
  isHead: boolean,
  bucketsRebuilt: number,
  isBoundary: IsBoundary,
): [Bucket[], Entry[], EntryDiff[]] {
  const buckets: Bucket[] = [];
  let entries: Entry[] = leftovers;
  const diffs: EntryDiff[] = [];

  const boundary = bucket.getBoundary();
  if (!isHead && (boundary == null || !isBoundary(boundary))) {
    throw new Error("malformed tree.");
  }

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
        buckets.push(getBucket(bucket, entries, false));
        entries = [];
        bucketsRebuilt++;
      }
    }
  }

  // only create another bucket if isHead and there are entries or no buckets were rebuilt for the level yet.
  if (isHead && (entries.length > 0 || bucketsRebuilt === 0)) {
    buckets.push(getBucket(bucket, entries, true));
    entries = [];
    bucketsRebuilt++;
  }

  return [buckets, entries, diffs];
}

/**
 * Rebuilds a level of the tree.
 *
 * @remarks
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
  level: number,
  createIsBoundary: CreateIsBoundary,
): AsyncIterable<ProllyTreeDiff> {
  let leftovers: Entry[] = [];

  const tuple = await getCurrentUpdateTuple(updts, level);
  let [updatee, isTail, isHead] = await getUpdatee(
    cursor,
    leftovers,
    tuple,
    level,
  );

  // only first updatee of level could be isTail
  const visitedLevelTail: boolean = isTail;
  let visitedLevelHead: boolean = isHead;

  let potentialRoot: Bucket | null = null;
  let bucketsRebuilt: number = 0;
  let updatedLevel: boolean = false;

  let d = createProllyTreeDiff();

  while (updatee != null) {
    const boundary = updatee.getBoundary();
    const isBoundary = createIsBoundary(updatee.average, updatee.level);

    if (level === 0) {
      // boundary! because collectUpdates checks isHead before using boundary
      await collectUpdates(boundary!, updts, isHead);
    }

    // could edit updates in rebuildBucket instead of splice
    const updates = updts.current.splice(
      0,
      // empty bucket is always isHead so updatee.getBoundary()! should be fine
      isHead
        ? updts.current.length
        : exclusiveMax(updts.current, updatee.getBoundary()!, compareTuples),
    );

    const [buckets, entries, entryDiffs] = rebuildBucket(
      updatee,
      leftovers,
      updates,
      isHead,
      bucketsRebuilt,
      isBoundary,
    );
    bucketsRebuilt += buckets.length;
    leftovers = entries;

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
        [updatee],
        buckets,
        compareBoundaries,
      )) {
        // prioritize add updates
        if (add != null) {
          const parentEntry = add.getParentEntry();

          parentEntry && updts.next.push(parentEntry);
        } else {
          const parentEntry = rm.getParentEntry();

          parentEntry && updts.next.push(entryToTuple(parentEntry));
        }
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
      if (buckets.length > 0 && leftovers.length === 0) {
        d.buckets.sort(compareBucketDiffs);
        yield d;
        d = createProllyTreeDiff();
      }
    }

    // keep the last rebuilt bucket
    potentialRoot = buckets[0] ?? potentialRoot;

    const tuple = await getCurrentUpdateTuple(updts, level);
    [updatee, isTail, isHead] = await getUpdatee(
      cursor,
      leftovers,
      tuple,
      level,
    );
    visitedLevelHead = visitedLevelHead || isHead;
  }

  // no updates to level
  if (!updatedLevel) {
    state.newRoot = firstElement(cursor.buckets());
    return;
  }

  let i = 0;
  for (const b of state.removedBuckets) {
    if (b.level !== level) break;
    i++;
  }
  // add removed buckets on the same level to diff
  d.buckets.push(
    ...state.removedBuckets.splice(0, i).map<BucketDiff>((b) => [b, null]),
  );

  // new root found!
  if (bucketsRebuilt === 1 && visitedLevelTail && visitedLevelHead) {
    if (potentialRoot == null) {
      throw new Error("potentialRoot should not be null");
    }

    // add the rest of the removedBuckets to the diff
    d.buckets.push(...state.removedBuckets.map<BucketDiff>((b) => [b, null]));
    state.removedBuckets = [];
    state.newRoot = potentialRoot;
  }

  // sort updates for next level, may be safely removed at some point when the tests are better
  updts.next.sort(compareTuples);

  // this is a bit similar to how rebuildBucket works, e.g. on head catching the rest of the bucket diffs for the level
  if (d.buckets.length > 0) {
    d.buckets.sort(compareBucketDiffs);
    yield d;
  }
}

/**
 * Ensures the updates are sorted and non-duplicative. Also skips empty update arrays.
 *
 * @param updates - The updates to be sorted and deduplicated.
 * @returns An async iterable of sorted and deduplicated updates.
 */
export async function* ensureSortedUpdates(
  updates: AwaitIterable<Update | Update[]>,
): AsyncIterable<Update | Update[]> {
  let firstUpdate: Update | null = null;
  let lastUpdate: Update | null = null;

  for await (const u of updates) {
    if (Array.isArray(u)) {
      if (u.length === 0) continue; // skip empty updates

      for (const _ of ensureSortedSet(u, compareTuples));

      firstUpdate = u[0]!;
    } else {
      firstUpdate = u;
    }

    if (lastUpdate != null && compareTuples(lastUpdate, firstUpdate) >= 0) {
      throw new Error("updates are unsorted or duplicates.");
    }

    lastUpdate = Array.isArray(u) ? u[u.length - 1]! : u;

    yield u;
  }
}

export async function* mutate(
  blockstore: Blockstore,
  tree: ProllyTree,
  updates: AwaitIterable<Update | Update[]>,
): AsyncIterable<ProllyTreeDiff> {
  updates = ensureSortedUpdates(updates);

  let updts: Updts = {
    user: updates,
    current: [],
    next: [],
  };

  let state: State = {
    newRoot: null,
    removedBuckets: [],
  };

  let level: number = 0;

  const cursor = createCursor(blockstore, tree);

  while (state.newRoot == null && level < MAX_LEVEL) {
    yield* rebuildLevel(cursor, updts, state, level, createIsBoundary);

    level++;
    updts.current = updts.next;
    updts.next = [];
  }

  if (state.newRoot == null) {
    throw new Error("Reached max level without finding a new root.");
  }

  tree.root = state.newRoot;
}
