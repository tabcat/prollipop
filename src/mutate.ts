import { union } from "@tabcat/sorted-sets/union";
import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import { compare as compareBytes } from "uint8arrays";
import { IsBoundary, createIsBoundary } from "./boundary.js";
import {
  createSharedAwaitIterable,
  ensureSortedTuplesIterable,
  findUpperBound,
} from "./common.js";
import {
  compareBoundaries,
  compareBucketDigests,
  compareBuckets,
  compareLevels,
  compareTuples,
  composeComparators,
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
  AwaitIterable,
  Bucket,
  Cursor,
  Entry,
  ProllyTree,
  Tuple,
} from "./interface.js";
import {
  createBucket,
  entryToTuple,
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
      return u[0]!;
    }
  }

  return null;
}

export function createGetUpdatee(
  average: number,
  level: number,
  cursor: Cursor,
) {
  return async function getUpdatee(
    tuple: Tuple | null,
    leftovers: boolean,
  ): Promise<Bucket | null> {
    if (leftovers) {
      await cursor.nextBucket();
      return cursor.currentBucket();
    }

    if (tuple == null) {
      return null;
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
  };
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
    !isHead &&
    compareTuples(updts.current[updts.current.length - 1]!, boundary!) >= 0;

  if (stop()) {
    // already have enough updates
    return;
  }

  for await (const u of updts.user) {
    updts.current.push(...u);
    if (stop()) break;
  }
}

/**
 * Separate entries into segments at boundaries.
 * Always returns an entrySegments with at least one segment.
 *
 * @param bucket
 * @param lastEntries
 * @param updates
 * @param isBoundary
 * @returns
 */
export function segmentEntries(
  currentEntries: Entry[],
  lastEntries: Entry[],
  lastDiffs: EntryDiff[],
  updates: Update[],
  isBoundary: IsBoundary,
): [Entry[][], EntryDiff[][], boolean] {
  const entrySegments: Entry[][] = [];
  const diffSegments: EntryDiff[][] = [];
  let entries = lastEntries;
  let diffs: EntryDiff[] = lastDiffs;

  let leftovers = false;

  if (
    lastEntries.length > 0 &&
    isBoundary(lastEntries[lastEntries.length - 1]!)
  ) {
    entrySegments.push(entries);
    diffSegments.push(diffs);
    entries = [];
    diffs = [];
  }

  for (const [e, u] of pairwiseTraversal(
    currentEntries,
    updates,
    compareTuples,
  )) {
    const [entry, entryDiff] = applyUpdate(e, u);

    entryDiff && diffs.push(entryDiff);

    if (entry != null) {
      entries.push(entry);
      if (isBoundary(entry)) {
        entrySegments.push(entries);
        diffSegments.push(diffs);
        entries = [];
        diffs = [];
      }
    }
  }

  if (entrySegments.length === 0 || entries.length > 0) {
    entrySegments.push(entries);
    diffSegments.push(diffs);
    entries = [];
    diffs = [];
    leftovers = true;
  }

  if (diffs.length > 0) {
    // should only happen if all the entries were removed after a boundary
    diffSegments.push(diffs);
  }

  return [entrySegments, diffSegments, leftovers];
}

/**
 * Rebuilds a level of the tree.
 *
 * Only yields diffs when the level is changed.
 * Entry diffs are only yielded on level 0.
 * Writes to the state.removedBuckets array if a level 0 bucket is changed/removed/added.
 * Writes to the state.newRoot if a new root is found.
 * A new root is found when the tail and head buckets were changed and only one bucket was rebuilt for the level.
 *
 * @param cursor - The cursor to the current tree.
 * @param updts - The state of the updates for the tree.
 * @param state - The state of the mutation.
 * @param average - The average number of entries per bucket.
 * @param level - The level to be rebuilt.
 * @returns
 */
export async function* rebuildLevel(
  cursor: Cursor,
  updts: Updts,
  state: State,
  average: number,
  level: number,
): AsyncIterable<ProllyTreeDiff> {
  let d = createProllyTreeDiff();

  let updatedLevel: boolean = false;
  let bucketsRebuilt: number = 0;
  let visitedTail: boolean = false;
  let visitedHead: boolean = false;

  let lastEntries: Entry[] = [];
  let lastDiffs: EntryDiff[] = [];

  const isBoundary = createIsBoundary(average, level);
  const getUpdatee = createGetUpdatee(average, level, cursor);

  let updatee = await getUpdatee(
    updts.current[0] ?? (await getUserUpdateTuple(updts, level)),
    false,
  );

  while (updatee != null) {
    const { isTail, isHead } = updatee.getContext();
    visitedTail = visitedTail || isTail;
    visitedHead = visitedHead || isHead;

    const boundary = getBucketBoundary(updatee);

    if (level === 0) {
      await collectUpdates(boundary, updts, isHead);
    }

    const updates = updts.current.splice(
      0,
      isHead
        ? updts.current.length
        : findUpperBound(updts.current, boundary!, compareTuples),
    );

    const [entrySegments, diffSegments, leftovers] = segmentEntries(
      updatee.entries,
      lastEntries,
      lastDiffs,
      updates,
      isBoundary,
    );

    const buckets = cursor.buckets().reverse();

    const nextUpdatee = await getUpdatee(
      updts.current[0] ?? (await getUserUpdateTuple(updts, level)),
      leftovers && !isHead,
    );

    if (nextUpdatee != null) {
      lastEntries = entrySegments.splice(-1)[0]!;
      lastDiffs = diffSegments.splice(-1)[0]!;
    }

    if (level === 0) {
      d.entries.push(...diffSegments.flat());

      state.removedBuckets = Array.from(
        union(state.removedBuckets, buckets, compareBuckets),
      );
    }

    // rebuild buckets
    const addedBuckets: Bucket[] = [];
    for (const segment of entrySegments) {
      const context = {
        isTail:
          visitedTail && bucketsRebuilt === 0 && segment === entrySegments[0],
        isHead:
          visitedHead && segment === entrySegments[entrySegments.length - 1],
      };
      const bucket = createBucket(average, level, segment, context);

      if (context.isTail && context.isHead) {
        state.newRoot = bucket;
      }

      addedBuckets.push(bucket);
      bucketsRebuilt++;
    }

    // add updates for next level and bucket diffs
    let removesProcessed = 0;
    for (const [added, removed, addedDone] of pairwiseTraversal(
      addedBuckets,
      state.removedBuckets,
      composeComparators(compareLevels, compareBoundaries),
    )) {
      if (
        (addedDone && !isHead) ||
        (removed != null && removed.level !== level)
      ) {
        break;
      }

      const different =
        added == null ||
        removed == null ||
        compareBucketDigests(added, removed) !== 0;

      updatedLevel = updatedLevel || different;

      let update: Update | null = null;
      const diffs: BucketDiff[] = [];

      if (removed != null) {
        different && diffs.push([removed, null]);

        const bucketEntry = getBucketEntry(removed);
        if (bucketEntry != null) {
          update = entryToTuple(bucketEntry);
        }

        removesProcessed++;
      }

      if (added != null) {
        different && diffs.push([null, added]);

        update = getBucketEntry(added);
      }

      update && updts.next.push(update);
      diffs.sort((a, b) => compareBuckets(a[0] ?? a[1]!, b[0] ?? b[1]!));
      d.buckets.push(...diffs);
    }
    state.removedBuckets.splice(0, removesProcessed);

    if (d.buckets.length > 0 && state.newRoot == null) {
      yield d;
      d = createProllyTreeDiff();
    }

    updatee = nextUpdatee;
  }

  // no updates to level
  if (!updatedLevel) {
    state.newRoot = cursor.buckets()[0]!;
    return;
  }

  // found new root, yield any removed buckets from higher levels
  if (state.newRoot != null) {
    for (const b of state.removedBuckets) {
      d.buckets.push([b, null]);
    }
    state.removedBuckets = [];

    if (d.buckets.length > 0) {
      yield d;
    }

    updts.next.length = 0;
  }
}

export async function* mutate(
  blockstore: Blockstore,
  tree: ProllyTree,
  updates: AwaitIterable<Update[]>,
): AsyncIterable<ProllyTreeDiff> {
  let updts: Updts = {
    user: createSharedAwaitIterable(ensureSortedTuplesIterable(updates)),
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

    updts.current = updts.next;
    updts.next = [];
    level++;
  }

  if (state.newRoot == null) {
    throw new Error("Reached max level without finding a new root.");
  }

  tree.root = state.newRoot;
}
