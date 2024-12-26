import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import type { Blockstore } from "interface-blockstore";
import { TupleRange } from "./codec.js";
import { compareBytes, compareTuples } from "./compare.js";
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
      return preMove(
        level ?? levelOf(state),
        state,
        nextAtLevel.bind(null, false),
      );
    },
    nextBucket(level?: number) {
      return preMove(
        level ?? levelOf(state),
        state,
        nextAtLevel.bind(null, true),
      );
    },
    nextTuple(tuple: Tuple, level?: number) {
      return preMove(
        level ?? levelOf(state),
        state,
        nextTupleAtLevel.bind(null, tuple),
      );
    },

    jumpTo(tuple: Tuple, level?: number) {
      return preWrite(
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

const preWrite = async (
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

const preMove = (
  level: number,
  state: CursorState,
  mover: (level: number, state: CursorState) => Promise<void>,
) => {
  if (level > rootLevelOf(state)) {
    state.isDone = true;
    return Promise.resolve();
  }

  return preWrite(level, state, mover);
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

/**
 * Returns whether increasing the currentIndex will overflow the bucket.
 *
 * @param state
 * @returns
 */
const overflows = (state: CursorState): boolean =>
  state.currentIndex === lastElement(state.currentBuckets).entries.length - 1;

/**
 * Returns whether decreasing the currentIndex will underflow the bucket.
 *
 * @param state
 * @returns
 */
const underflows = (state: CursorState): boolean => state.currentIndex === 0;

const moveUp = (
  state: CursorState,
  level: number,
  guide?: (entries: Entry[]) => number,
) => {
  if (level > rootLevelOf(state)) {
    throw new Error("Cannot move higher than root level.");
  }

  guide = guide ?? guideByTuple(entryOf(state));

  const difference = levelOf(state) - level;

  state.currentBuckets.splice(difference, -difference);
  state.currentIndex = guide(bucketOf(state).entries);
};

const getRange = (state: CursorState): TupleRange => {
  const clone = cloneCursorState(state);
  while (underflows(clone) && levelOf(clone) < rootLevelOf(clone)) {
    moveUp(clone, levelOf(clone) + 1);
  }

  const min = bucketOf(clone).entries[clone.currentIndex - 1];

  return [min ?? minTuple, entryOf(state)];
};

const moveDown = async (
  state: CursorState,
  level: number,
  guide?: (entries: Entry[]) => number,
  cache?: Bucket[],
) => {
  if (level < 0) {
    throw new Error("Cannot move lower than level 0.");
  }

  guide = guide ?? (() => 0);

  while (level < levelOf(state)) {
    const { seq, val } = entryOf(state);
    const bucket = bucketOf(state);

    const cached = cache?.[bucket.level - 1];
    if (
      cached != null &&
      compareBytes(cached.getAddressed().digest, val) === 0
    ) {
      state.currentBuckets.push(cached);
    } else {
      const lowerBucket = await loadBucket(
        state.blockstore,
        val,
        {
          isTail: underflows(state) && bucket.getContext().isTail,
          isHead: overflows(state) && bucket.getContext().isHead,
        },
        {
          prefix: {
            average: bucket.average,
            level: bucket.level - 1,
            base: seq,
          },
          range: getRange(state),
        },
      );
      state.currentBuckets.push(lowerBucket);
    }

    state.currentIndex = guide(bucketOf(state).entries);
  }
};

const moveLevel = async (
  state: CursorState,
  level: number,
  guide?: (entries: Entry[]) => number,
) => {
  if (level > levelOf(state)) {
    moveUp(state, level, guide);
  } else if (level < levelOf(state)) {
    await moveDown(state, level, guide);
  }
};

const moveRight = async (
  state: CursorState,
  moveUpWhile: (state: CursorState) => boolean,
  increment: (state: CursorState) => void,
  guide: (entries: Entry[]) => number,
) => {
  const originalLevel = levelOf(state);

  while (moveUpWhile(state) && state.currentBuckets.length > 1) {
    moveUp(state, levelOf(state) + 1);
  }

  if (overflows(state)) {
    state.isDone = true;
    guide = (entries) => entries.length - 1;
  } else {
    increment(state);
  }

  if (originalLevel < levelOf(state)) {
    await moveDown(state, originalLevel, guide);
  }
};

const nextAtLevel = async (
  bucket: boolean,
  level: number,
  state: CursorState,
): Promise<void> => {
  const movingDown = level < levelOf(state);

  if (level !== levelOf(state)) {
    await moveLevel(state, level);
  }

  // only increment if level was higher or equal to original level
  if (!movingDown) {
    if (bucket) {
      state.currentIndex = bucketOf(state).entries.length - 1;
    }

    moveRight(
      state,
      overflows,
      (state) => state.currentIndex++,
      () => 0,
    );
  }
};

const nextTupleAtLevel = async (
  tuple: Tuple,
  level: number,
  state: CursorState,
): Promise<void> => {
  // ensure that cursor does not move backwards
  if (compareTuples(tuple, entryOf(state)) <= 0 && level >= levelOf(state)) {
    tuple = entryOf(state);
  }

  if (level !== levelOf(state)) {
    await moveLevel(state, level, guideByTuple(tuple));
  }

  const guide = guideByTuple(tuple);
  const tupleIsGreatest = (state: CursorState) =>
    compareTuples(tuple, lastElement(bucketOf(state).entries)) > 0;

  await moveRight(
    state,
    tupleIsGreatest,
    (state) => {
      state.currentIndex = guide(bucketOf(state).entries);
      state.isDone = tupleIsGreatest(state);
    },
    guide,
  );
};

const jumpToTupleAtLevel = async (
  tuple: Tuple,
  level: number,
  state: CursorState,
): Promise<void> => {
  if (level > rootLevelOf(state)) {
    throw new Error("Cannot jump to level higher than root.");
  }

  const cache = state.currentBuckets;

  // set to root at index matching tuple
  state.currentBuckets = [firstElement(state.currentBuckets)];
  state.currentIndex = guideByTuple(tuple)(bucketOf(state).entries);

  // move to level if needed
  if (level < levelOf(state)) {
    await moveDown(state, level, guideByTuple(tuple), cache);
  }
};
