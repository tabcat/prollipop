import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import type { Blockstore } from "interface-blockstore";
import { TupleRange } from "./codec.js";
import { compareTuples } from "./compare.js";
import { minTuple } from "./constants.js";
import { Bucket, Entry, ProllyTree, Tuple } from "./interface.js";
import { loadBucket } from "./utils.js";

interface CursorState {
  blockstore: Blockstore;
  currentBuckets: Bucket[];
  currentIndex: number;
  isDone: boolean;
  isLocked: boolean;
}

const createCursorState = (
  blockstore: Blockstore,
  tree: ProllyTree,
): CursorState => {
  const currentBuckets = [tree.root];
  const currentIndex = Math.min(
    0,
    lastElement(currentBuckets).entries.length - 1,
  );

  return {
    blockstore,
    currentBuckets,
    currentIndex,
    isDone: currentIndex === -1,
    isLocked: false,
  };
};

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

  nextTuple(tuple: Tuple, level?: number): Promise<void>;

  /**
   * Jumps the cursor from root to the tuple or parent tuple at level. This is not a move operation.
   *
   * @param tuple
   * @param level
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

function createCursorFromState(state: CursorState): Cursor {
  return {
    level: () => levelOf(state),
    rootLevel: () => rootLevelOf(state),

    index: () => state.currentIndex,
    current: () => entryOf(state),

    buckets: () => Array.from(state.currentBuckets),
    currentBucket: () => bucketOf(state),

    next(level?: number) {
      return pm(level ?? levelOf(state), state, nextAtLevel.bind(null, false));
    },
    nextBucket(level?: number) {
      return pm(level ?? levelOf(state), state, nextAtLevel.bind(null, true));
    },
    nextTuple(tuple: Tuple, level?: number) {
      return pm(
        level ?? levelOf(state),
        state,
        nextTupleAtLevel.bind(null, tuple),
      );
    },

    jumpTo(tuple: Tuple, level?: number) {
      return pw(
        level ?? levelOf(state),
        state,
        jumpToTupleAtLevel.bind(null, tuple),
      );
    },

    isAtTail: () => bucketOf(state).getContext().isTail,
    isAtHead: () => bucketOf(state).getContext().isHead,

    clone: () => createCursorFromState(cloneCursorState(state)),

    locked: () => state.isLocked,
    done: () => state.isDone,
  };
}

/** pre-write */
const pw = async (
  level: number,
  state: CursorState,
  writer: (level: number, state: CursorState) => Promise<void>,
) => {
  if (state.isDone) {
    return;
  }

  if (state.isLocked) {
    throw new Error("Failed to acquire cursor lock.");
  }

  const stateClone = cloneCursorState(state);
  state.isLocked = true;

  await writer(level, stateClone);

  Object.assign(state, stateClone);
};

/** pre-move */
const pm = (
  level: number,
  state: CursorState,
  mover: (level: number, state: CursorState) => Promise<void>,
) => {
  if (level > rootLevelOf(state)) {
    state.isDone = true;
    return Promise.resolve();
  }

  return pw(level, state, mover);
};

/**
 * Create a cursor for the given tree.
 * If the tree is not empty, the cursor is initialized at the 0th index of the root entry.
 * Otherwise, the index is -1 and the cursor is set to done.
 *
 * @param blockstore
 * @param tree
 * @returns
 */
export function createCursor(blockstore: Blockstore, tree: ProllyTree): Cursor {
  const state = createCursorState(blockstore, tree);
  return createCursorFromState(state);
}

const cloneCursorState = (state: CursorState): CursorState =>
  Object.assign({ currentBuckets: Array.from(state.currentBuckets) }, state);

const bucketOf = (state: CursorState): Bucket =>
  lastElement(state.currentBuckets);

const entryOf = (state: CursorState): Entry => {
  if (state.currentIndex === -1) {
    throw new Error("Failed to return current entry from empty bucket.");
  }

  return ithElement(bucketOf(state).entries, state.currentIndex);
};

const levelOf = (state: CursorState): number => bucketOf(state).level;

const rootLevelOf = (state: CursorState): number =>
  firstElement(state.currentBuckets).level;

const guideByTuple =
  (target: Tuple) =>
  (entries: Entry[]): number => {
    const index = entries.findIndex((n) => compareTuples(target, n) <= 0);

    return index === -1 ? entries.length - 1 : index;
  };

const getRange = (state: CursorState): TupleRange => {
  const clone = cloneCursorState(state);
  while (underflows(clone) && levelOf(clone) < rootLevelOf(clone)) {
    moveUpOne(clone);
  }

  const min = bucketOf(clone).entries[clone.currentIndex - 1];

  return [min ?? minTuple, entryOf(state)];
};

const moveUpOne = (state: CursorState) => {
  if (rootLevelOf(state) === levelOf(state)) {
    throw new Error("Cannot move up one from root.");
  }

  const guide = guideByTuple(entryOf(state));

  state.currentBuckets.pop();
  state.currentIndex = guide(bucketOf(state).entries);
};

/**
 * Elevates or de-elevates the cursor along the path to the given level.
 * Never causes the cursor to increment without a provided guide parameter.
 *
 * @param state
 * @param level
 * @param guide
 */
const moveToLevel = async (
  state: CursorState,
  level: number,
  guide?: (entries: Entry[]) => number,
): Promise<void> => {
  if (level === levelOf(state) || level < 0 || level > rootLevelOf(state)) {
    throw new Error(
      "Cannot move to the current level or outside the root level.",
    );
  }

  // guides currentIndex during traversal
  guide =
    guide ??
    (level < levelOf(state)
      ? () => 0 // guide to first entry if moving down
      : guideByTuple(entryOf(state)));

  while (level !== levelOf(state)) {
    if (level > levelOf(state)) {
      // jump up to higher level
      const difference = levelOf(state) - level;

      state.currentBuckets.splice(difference, -difference);
    } else {
      const { average, level } = bucketOf(state);
      // walk down to lower level
      const bucket = await loadBucket(
        state.blockstore,
        entryOf(state).val,
        {
          isTail: underflows(state) && bucketOf(state).getContext().isTail,
          isHead: overflows(state) && bucketOf(state).getContext().isHead,
        },
        {
          prefix: { average, level: level - 1, base: entryOf(state).seq },
          range: getRange(state),
        },
      );

      state.currentBuckets.push(bucket);
    }

    // set to guided index in new bucket
    state.currentIndex = guide(bucketOf(state).entries);
  }
};

/**
 * Returns whether increasing the currentIndex will overflow the bucket.
 *
 * @param state - the state of the cursor
 * @returns
 */
const overflows = (state: CursorState): boolean =>
  state.currentIndex === lastElement(state.currentBuckets).entries.length - 1;

const underflows = (state: CursorState): boolean => state.currentIndex === 0;

/**
 * Increments the cursor by one on the same level. Handles traversing buckets if necessary.
 *
 * @param state
 * @returns
 */
const moveSideways = async (state: CursorState): Promise<void> => {
  if (overflows(state) && bucketOf(state).getContext().isHead) {
    state.isDone = true;
    return;
  }

  const startingLevel = levelOf(state);

  // find a higher level which allows increasing currentIndex
  while (overflows(state)) {
    moveUpOne(state);
  }

  state.currentIndex += 1;

  if (levelOf(state) > startingLevel) {
    await moveToLevel(state, startingLevel);
  }
};

const nextAtLevel = async (
  bucket: boolean,
  level: number,
  state: CursorState,
): Promise<void> => {
  const movingDown = level < levelOf(state);

  if (level !== levelOf(state)) {
    await moveToLevel(state, level);
  }

  // only increment if level was higher or equal to original level
  if (!movingDown) {
    if (bucket) {
      state.currentIndex = bucketOf(state).entries.length - 1;
    }

    await moveSideways(state);
  }
};

const nextTupleAtLevel = async (
  tuple: Tuple,
  level: number,
  state: CursorState,
): Promise<void> => {
  if (compareTuples(tuple, entryOf(state)) <= 0 && level >= levelOf(state)) {
    tuple = entryOf(state);
  }

  while (compareTuples(tuple, lastElement(bucketOf(state).entries)) > 0) {
    if (state.currentBuckets.length === 1) {
      state.isDone = true;
      break;
    }

    await moveToLevel(state, levelOf(state) + 1);
  }

  const guide = guideByTuple(tuple);
  state.currentIndex = guide(bucketOf(state).entries);

  if (level < levelOf(state)) {
    await moveToLevel(state, level, guide);
  }
};

// should look at current buckets to traverse faster
// could have the current buckets be part of a cache that can be read from by the other methods
const jumpToTupleAtLevel = async (
  tuple: Tuple,
  level: number,
  state: CursorState,
): Promise<void> => {
  if (level > rootLevelOf(state)) {
    throw new Error("Cannot jump to level higher than root.");
  }

  // set to root at index matching tuple
  state.currentBuckets = [firstElement(state.currentBuckets)];
  state.currentIndex = guideByTuple(tuple)(bucketOf(state).entries);

  // move to level if needed
  if (level < levelOf(state)) {
    await moveToLevel(state, level, guideByTuple(tuple));
  }
};
