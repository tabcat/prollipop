import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import type { Blockstore } from "interface-blockstore";
import { TupleRange } from "./codec.js";
import { compareBytes, compareTuples } from "./compare.js";
import { minTuple } from "./constants.js";
import { Bucket, Cursor, Entry, ProllyTree, Tuple } from "./interface.js";
import { loadBucket } from "./utils.js";

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

export interface CursorState {
  blockstore: Blockstore;
  currentBuckets: Bucket[];
  currentIndex: number;
  isDone: boolean;
  isLocked: boolean;
}

export const createCursorState = (
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

export function createCursorFromState(state: CursorState): Cursor {
  return {
    level: () => levelOf(state),
    rootLevel: () => rootLevelOf(state),

    index: () => state.currentIndex,
    current: () => entryOf(state),

    buckets: () => Array.from(state.currentBuckets),
    currentBucket: () => bucketOf(state),

    isAtTail: () => bucketOf(state).getContext().isTail,
    isAtHead: () => bucketOf(state).getContext().isHead,

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

    clone: () => createCursorFromState(cloneCursorState(state)),

    locked: () => state.isLocked,
    done: () => state.isDone,
  };
}

export const preWrite = async (
  level: number,
  state: CursorState,
  writer: (level: number, state: CursorState) => Promise<void>,
) => {
  if (state.isLocked) {
    throw new Error("Failed to acquire cursor lock.");
  }

  if (state.isDone) {
    writer = (level, state) =>
      moveLevel(state, level, (entries) => entries.length - 1);
  }

  const stateClone = cloneCursorState(state);
  state.isLocked = true;

  await writer(level, stateClone);

  Object.assign(state, stateClone);
};

export const preMove = (
  level: number,
  state: CursorState,
  mover: (level: number, state: CursorState) => Promise<void>,
) => {
  if (level > rootLevelOf(state)) {
    mover = async (_, state) => {
      state.currentBuckets = [firstElement(state.currentBuckets)];
      state.currentIndex = state.currentBuckets[0]!.entries.length - 1;
      state.isDone = true;
    };
  }

  return preWrite(level, state, mover);
};

export const cloneCursorState = (state: CursorState): CursorState => ({
  ...state,
  currentBuckets: Array.from(state.currentBuckets),
});

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

export const guideByTuple =
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

export const moveUp = (
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

export const getRange = (state: CursorState): TupleRange => {
  const clone = cloneCursorState(state);
  while (underflows(clone) && levelOf(clone) < rootLevelOf(clone)) {
    moveUp(clone, levelOf(clone) + 1);
  }

  const min = bucketOf(clone).entries[clone.currentIndex - 1];

  return [min ?? minTuple, entryOf(state)];
};

export const moveDown = async (
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

export const moveLevel = async (
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

export const moveRight = async (
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

export const nextAtLevel = async (
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

    await moveRight(
      state,
      overflows,
      (state) => state.currentIndex++,
      () => 0,
    );
  }
};

export const nextTupleAtLevel = async (
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

export const jumpToTupleAtLevel = async (
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
