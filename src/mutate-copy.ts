import { firstElement, lastElement } from "@tabcat/ith-element";
import { union } from "@tabcat/sorted-sets/union";
import { Blockstore } from "interface-blockstore";
import { compare as compareBytes } from "uint8arrays";
import { createIsBoundary } from "./boundary.js";
import { compareBuckets, compareTuples } from "./compare.js";
import { MAX_LEVEL } from "./constants.js";
import { createCursor } from "./cursor.js";
import { EntryDiff, ProllyTreeDiff, createProllyTreeDiff } from "./diff.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import { Bucket, Cursor, Entry, ProllyTree, Tuple } from "./interface.js";
import {
  AwaitIterable,
  createReusableAwaitIterable,
  ensureSortedTuplesIterable,
  getBucketBoundary,
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
  let changedLevelTail: boolean = false;
  let changedLevelHead: boolean = false;

  const isBoundary = createIsBoundary(average, level);
  const getUpdatee = createGetUpdatee(average, level, cursor);

  let updatee = await getUpdatee(
    updts.current[0] ?? (await getUserUpdateTuple(updts, level)),
    false,
  );

  while (updatee != null) {
    const { isTail, isHead } = updatee.getContext();

    const boundary = getBucketBoundary(updatee);

    if (level === 0) {
      await collectUpdates(boundary, updts, isHead);
    }

    const updates = updts.current.splice(
      0,
      isHead
        ? updts.current.length
        : exclusiveMax(updts.current, boundary!, compareTuples),
    );

    const buckets = cursor.buckets().reverse();
    const leftovers = false;

    const nextUpdatee = await getUpdatee(
      updts.current[0] ?? (await getUserUpdateTuple(updts, level)),
      leftovers,
    );

    let changed = true;
    let changedUpdatee = true;

    if (changed) {
      changedLevelTail = changedLevelTail || isTail;
      changedLevelHead = changedLevelHead || isHead;
      updatedLevel = true;

      if (changedUpdatee) {
        state.removedBuckets = Array.from(
          union(state.removedBuckets, buckets, compareBuckets),
        );
      }
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
    if (state.removedBuckets.length > 0) {
      for (const b of state.removedBuckets) {
        d.buckets.push([b, null]);
      }
      state.removedBuckets = [];

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

    updts.current = updts.next;
    updts.next = [];
    level++;
  }

  if (state.newRoot == null) {
    throw new Error("Reached max level without finding a new root.");
  }

  tree.root = state.newRoot;
}
