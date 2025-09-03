import { compareBytes, compareKeys } from "../compare.js";
import {
  Await,
  Blockfetcher,
  Bucket,
  ComparableKey,
  Entry,
  KeyRange,
  ProllyTree,
} from "../interface.js";
import { loadBucket } from "../utils.js";

interface CursorWriter {
  (state: CursorState, level: number): Await<void>;
}

export const preWrite = async (
  state: CursorState,
  level: number,
  writer: CursorWriter,
) => {
  if (state.isLocked) {
    throw new Error("Failed to acquire cursor lock.");
  }

  if (state.isDone) {
    writer = (state, level) =>
      moveUpOrDown(state, level, (entries) => entries.length - 1);
  }

  const stateClone = cloneCursorState(state);
  state.isLocked = true;

  await writer(stateClone, level);

  Object.assign(state, stateClone);
};

const moveToDoneEndOfRoot = (state: CursorState) => {
  state.currentBuckets = [state.currentBuckets[0]!];
  state.currentIndex = state.currentBuckets[0]!.entries.length - 1;
  state.isDone = true;
};

export const preMove = (
  state: CursorState,
  level: number,
  mover: CursorWriter,
) => {
  if (level > getRootLevel(state)) {
    mover = moveToDoneEndOfRoot;
  }

  return preWrite(state, level, mover);
};

export interface CursorState {
  blockstore: Blockfetcher;
  currentBuckets: Bucket[];
  currentIndex: number;
  isDone: boolean;
  isLocked: boolean;
}

export const createCursorState = (
  blockstore: Blockfetcher,
  tree: ProllyTree,
): CursorState => {
  const currentBuckets = [tree.root];
  const currentIndex = Math.min(
    0,
    currentBuckets[currentBuckets.length - 1]!.entries.length - 1,
  );

  return {
    blockstore,
    currentBuckets,
    currentIndex,
    isDone: currentIndex === -1,
    isLocked: false,
  };
};

export const cloneCursorState = (state: CursorState): CursorState => ({
  ...state,
  currentBuckets: Array.from(state.currentBuckets),
});

export const getCurrentBucket = (state: CursorState): Bucket => {
  const bucket = state.currentBuckets[state.currentBuckets.length - 1];

  if (bucket == null) {
    throw new TypeError("cursor state invalid. currentBuckets is empty.");
  }

  return bucket;
};

export const getCurrentEntry = (state: CursorState): Entry => {
  const entry = getCurrentBucket(state).entries[state.currentIndex];

  if (entry == null) {
    throw new Error("there is no current entry.");
  }

  return entry;
};

export const getCurrentLevel = (state: CursorState): number =>
  getCurrentBucket(state).level;

export const getRootLevel = (state: CursorState): number =>
  state.currentBuckets[0]!.level;

export const getKeyRange = (state: CursorState): KeyRange => {
  const clone = cloneCursorState(state);
  while (underflows(clone) && getCurrentLevel(clone) < getRootLevel(clone)) {
    moveUp(clone, getCurrentLevel(clone) + 1);
  }

  const min = getCurrentBucket(clone).entries[clone.currentIndex - 1]?.key;
  const entry = getCurrentBucket(state).entries[state.currentIndex];

  return [min ?? "MIN_KEY", entry?.key ?? "MAX_KEY"];
};

export const guideByKey =
  (target: ComparableKey) =>
  (entries: Entry[]): number => {
    const index = entries.findIndex((n) => compareKeys(target, n.key) <= 0);

    return index === -1 ? entries.length - 1 : index;
  };

/**
 * Returns whether increasing the currentIndex will overflow the bucket.
 *
 * @param state
 * @returns
 */
const overflows = (state: CursorState): boolean =>
  state.currentIndex === getCurrentBucket(state).entries.length - 1;

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
  if (level > getRootLevel(state)) {
    throw new Error("Cannot move higher than root level.");
  }

  guide = guide ?? guideByKey(getCurrentEntry(state).key);

  state.currentBuckets.length -= level - getCurrentLevel(state);
  state.currentIndex = guide(getCurrentBucket(state).entries);
};

export const moveDown = async (
  state: CursorState,
  level: number,
  guide?: (entries: Entry[]) => number,
  previousBuckets?: Bucket[],
) => {
  if (level < 0) {
    throw new Error("Cannot move lower than level 0.");
  }

  guide = guide ?? (() => 0);

  while (level < getCurrentLevel(state)) {
    const { val } = getCurrentEntry(state);
    const bucket = getCurrentBucket(state);

    const cached = previousBuckets?.[bucket.level - 1];
    if (
      cached != null &&
      compareBytes(cached.getAddressed().digest, val) === 0
    ) {
      state.currentBuckets.push(cached);
    } else {
      const expected = {
        prefix: {
          average: bucket.average,
          level: bucket.level - 1,
        },
        range: getKeyRange(state),
      };
      const lowerBucket = await loadBucket(
        state.blockstore,
        val,
        {
          isTail: underflows(state) && bucket.getContext().isTail,
          isHead: overflows(state) && bucket.getContext().isHead,
        },
        expected,
      );
      state.currentBuckets.push(lowerBucket);
    }

    state.currentIndex = guide(getCurrentBucket(state).entries);
  }
};

export const moveUpOrDown = async (
  state: CursorState,
  level: number,
  guide?: (entries: Entry[]) => number,
) => {
  if (level > getCurrentLevel(state)) {
    moveUp(state, level, guide);
  } else if (level < getCurrentLevel(state)) {
    await moveDown(state, level, guide);
  }
};

export const moveRight = async (
  state: CursorState,
  moveUpWhile: (state: CursorState) => boolean,
  increment: (state: CursorState) => void,
  guide: (entries: Entry[]) => number,
) => {
  const originalLevel = getCurrentLevel(state);

  while (moveUpWhile(state) && state.currentBuckets.length > 1) {
    moveUp(state, getCurrentLevel(state) + 1);
  }

  if (overflows(state) && getCurrentLevel(state) === getRootLevel(state)) {
    state.isDone = true;
    guide = (entries) => entries.length - 1;
  } else {
    increment(state);
  }

  if (originalLevel < getCurrentLevel(state)) {
    await moveDown(state, originalLevel, guide);
  }
};

export const nextAtLevel = async (
  state: CursorState,
  level: number,
  bucket: boolean,
): Promise<void> => {
  const movingDown = level < getCurrentLevel(state);

  if (level !== getCurrentLevel(state)) {
    await moveUpOrDown(state, level);
  }

  // only increment if level was higher or equal to original level
  if (!movingDown) {
    if (bucket) {
      state.currentIndex = getCurrentBucket(state).entries.length - 1;
    }

    await moveRight(
      state,
      overflows,
      (state) => state.currentIndex++,
      () => 0,
    );
  }
};

export const skipToKeyAtLevel = async (
  state: CursorState,
  key: ComparableKey,
  level: number,
): Promise<void> => {
  // ensure that cursor does not move backwards
  const entry = getCurrentEntry(state);
  if (compareKeys(key, entry.key) <= 0 && level >= getCurrentLevel(state)) {
    key = entry.key;
  }

  if (level !== getCurrentLevel(state)) {
    await moveUpOrDown(state, level, guideByKey(key));
  }

  const guide = guideByKey(key);
  const keyIsGreatest = (state: CursorState) =>
    compareKeys(
      key,
      getCurrentBucket(state).entries[
        getCurrentBucket(state).entries.length - 1
      ]!.key,
    ) > 0;

  await moveRight(
    state,
    keyIsGreatest,
    (state) => {
      state.currentIndex = guide(getCurrentBucket(state).entries);
      state.isDone = keyIsGreatest(state);
    },
    guide,
  );
};

export const resetToKeyAtLevel = async (
  state: CursorState,
  key: ComparableKey,
  level: number,
): Promise<void> => {
  if (level > getRootLevel(state)) {
    throw new Error("Cannot jump to level higher than root.");
  }

  const previousBuckets = state.currentBuckets;

  // set to root at index matching key
  state.currentBuckets = [state.currentBuckets[0]!];
  state.currentIndex = guideByKey(key)(getCurrentBucket(state).entries);

  // move to level if needed
  if (level < getCurrentLevel(state)) {
    await moveDown(state, level, guideByKey(key), previousBuckets);
  }
};
