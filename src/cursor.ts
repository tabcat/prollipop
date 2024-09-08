import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import type { Blockstore } from "interface-blockstore";
import { CID } from "multiformats";
import { compare } from "uint8arrays";
import { compareTuples } from "./compare.js";
import { Bucket, Node, ProllyTree, Tuple } from "./interface.js";
import { loadBucket, prefixWithLevel } from "./utils.js";

const failedToAquireLockErr = () => new Error("Failed to aquire cursor lock.");

interface CursorState {
  blockstore: Blockstore;
  currentBuckets: Bucket[];
  currentIndex: number;
  isDone: boolean;
  isLocked: boolean;
}

const FailedToCreateCursorState = "Failed to create cursor state: ";

const createCursorState = (
  blockstore: Blockstore,
  tree: ProllyTree,
  currentBuckets?: Bucket[],
  currentIndex?: number,
): CursorState => {
  currentBuckets = currentBuckets ?? [tree.root];
  currentIndex =
    currentIndex ?? Math.min(0, lastElement(currentBuckets).nodes.length - 1);

  if (currentBuckets.length === 0) {
    throw new Error(`${FailedToCreateCursorState}currentBuckets.length === 0`);
  }

  if (currentIndex >= lastElement(currentBuckets).nodes.length) {
    throw new Error(
      `${FailedToCreateCursorState}currentIndex >= bucket.nodes.length`,
    );
  }

  if (currentIndex < -1) {
    throw new Error(`${FailedToCreateCursorState}currentIndex > -1`);
  }

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
   * Returns the index of the current node in the bucket. If index is -1 the bucket is empty and current() will throw an error.
   */
  index(): number;
  /**
   * Returns the current node in the bucket. If the bucket is empty this method will throw an error.
   */
  current(): Node;

  /**
   * Returns an array of buckets from root to current level.
   */
  buckets(): Bucket[];
  /**
   * Returns an array of bucket CIDs from root to current level.
   */
  path(): CID[];
  /**
   * Returns the current bucket. The last bucket in the array returned by the buckets() method.
   */
  currentBucket(): Bucket;

  /**
   * Increments the cursor to the next tuple on the current level.
   */
  next(): Promise<void>;
  /**
   * Increments the cursor to the next tuple on a specified level.
   *
   * @param level - The level to increment the cursor at.
   */
  nextAtLevel(level: number): Promise<void>;
  /**
   * Increments the cursor to the beginning of the next bucket on the current level.
   */
  nextBucket(): Promise<void>;
  /**
   * Increments the cursor to the beginning of the next bucket on the specified level.

   * @param level - The level to increment the cursor at.
   */
  nextBucketAtLevel(level: number): Promise<void>;
  /**
   * Fast forwards the cursor to
   *
   * @param tuple
   * @param level
   */
  ffw(tuple: Tuple, level: number): Promise<void>;

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
    current: () => nodeOf(state),

    buckets: () => Array.from(state.currentBuckets),
    path: () => state.currentBuckets.map((b) => b.getCID()),
    currentBucket: () => bucketOf(state),

    next: () => nextAtLevel(state, levelOf(state)),
    nextAtLevel: (level) => nextAtLevel(state, level),
    nextBucket: () => nextBucketAtLevel(state, levelOf(state)),
    nextBucketAtLevel: (level) => nextBucketAtLevel(state, level),
    ffw: (tuple, level) => ffwToTupleOnLevel(state, tuple, level),

    isAtTail: () => getIsAtTail(state),
    isAtHead: () => getIsAtHead(state),

    clone: () => createCursorFromState(cloneCursorState(state)),

    locked: () => state.isLocked,
    done: () => state.isDone,
  };
}

export function createCursor(blockstore: Blockstore, tree: ProllyTree): Cursor {
  const state = createCursorState(blockstore, tree);
  return createCursorFromState(state);
}

const cloneCursorState = (state: CursorState): CursorState => ({
  ...state,
  currentBuckets: Array.from(state.currentBuckets),
});

const bucketOf = (state: CursorState): Bucket =>
  lastElement(state.currentBuckets);

const nodeOf = (state: CursorState): Node =>
  ithElement(bucketOf(state).nodes, state.currentIndex);

const levelOf = (state: CursorState): number => bucketOf(state).level;

const rootLevelOf = (state: CursorState): number =>
  firstElement(state.currentBuckets).level;

const getIsExtremity = (
  state: CursorState,
  findExtemity: (nodes: Node[]) => Node,
): boolean => {
  let i = 0;

  // length - 1 because we are accessing i + 1
  while (i < state.currentBuckets.length - 1) {
    const parent = ithElement(state.currentBuckets, i);
    const child = ithElement(state.currentBuckets, i + 1);

    // check if the extreme node of the parent matches the current child all the way down from root
    if (compare(findExtemity(parent.nodes).message, child.getDigest()) !== 0) {
      return false;
    }

    i++;
  }

  return true;
};

const getIsAtTail = (state: CursorState): boolean =>
  getIsExtremity(state, firstElement);
const getIsAtHead = (state: CursorState): boolean =>
  getIsExtremity(state, lastElement);

/**
 * Returns whether increasing the currentIndex will overflow the bucket.
 *
 * @param state - the state of the cursor
 * @returns
 */
const overflows = (state: CursorState): boolean =>
  state.currentIndex === lastElement(state.currentBuckets).nodes.length - 1;

export const guideByTuple =
  (target: Tuple) =>
  (nodes: Node[]): number => {
    const index = nodes.findIndex((n) => compareTuples(target, n) > 0);

    return index === -1 ? nodes.length - 1 : index;
  };

// when descending it is important to keep to the left side
// otherwise nodes are skipped
export const guideByLowestIndex = () => 0;

/**
 * Moves the cursor vertically. Never causes the cursor to increment without a provided _guide parameter.
 *
 * @param state
 * @param level
 * @param _guide
 */
const moveToLevel = async (
  state: CursorState,
  level: number,
  _guide?: (nodes: Node[]) => number,
): Promise<void> => {
  if (level === levelOf(state)) {
    throw new Error("Level to move to cannot be same as current level.");
  }

  if (level < 0) {
    throw new Error("Level to move to cannot be less than 0.");
  }

  if (level > rootLevelOf(state)) {
    throw new Error("Level to move to cannot exceed height of root level.");
  }

  // guides currentIndex during traversal
  const guide: (nodes: Node[]) => number =
    _guide ??
    // 0 index when descending, current tuple when ascending
    (level < levelOf(state) ? guideByLowestIndex : guideByTuple(nodeOf(state)));

  while (level !== levelOf(state)) {
    if (level > levelOf(state)) {
      // jump up to higher level
      const difference = levelOf(state) - level;

      state.currentBuckets.splice(difference, -difference);
    } else {
      // walk down to lower level
      const digest = nodeOf(state).message;
      const bucket = await loadBucket(
        state.blockstore,
        digest,
        prefixWithLevel(bucketOf(state), levelOf(state) - 1),
      );

      if (bucket.nodes.length === 0) {
        throw new Error(
          "Malformed tree: fetched a child bucket with empty node set.",
        );
      }

      state.currentBuckets.push(bucket);
    }

    // set to guided index
    state.currentIndex = guide(bucketOf(state).nodes);
  }
};

/**
 * Increments the cursor by one on the same level. Handles traversing buckets if necessary.
 *
 * @param state
 * @returns
 */
const moveSideways = async (state: CursorState): Promise<void> => {
  const stateCopy = cloneCursorState(state);

  // find a higher level which allows increasing currentIndex
  while (overflows(stateCopy)) {
    // cannot increase currentIndex anymore, so done
    if (stateCopy.currentBuckets.length === 1) {
      state.isDone = true;
      return;
    }

    await moveToLevel(stateCopy, levelOf(stateCopy) + 1);
  }

  stateCopy.currentIndex += 1;

  // get back down to same level
  while (levelOf(stateCopy) !== levelOf(state)) {
    await moveToLevel(stateCopy, levelOf(state));
  }

  Object.assign(state, stateCopy);
};

const nextAtLevel = async (
  state: CursorState,
  level: number,
): Promise<void> => {
  if (level > rootLevelOf(state)) {
    state.isDone = true;
  }

  if (state.isDone) {
    return;
  }

  if (state.isLocked) {
    throw failedToAquireLockErr();
  }

  const stateCopy = cloneCursorState(state);
  state.isLocked = true;

  if (level !== levelOf(stateCopy)) {
    await moveToLevel(stateCopy, level);
  }

  // only increment if level was higher or equal to original level
  if (level >= levelOf(state)) {
    await moveSideways(stateCopy);
  }

  Object.assign(state, stateCopy);
};

const nextBucketAtLevel = async (
  state: CursorState,
  level: number,
): Promise<void> => {
  if (level > rootLevelOf(state)) {
    state.isDone = true;
  }

  if (state.isDone) {
    return;
  }

  if (state.isLocked) {
    throw failedToAquireLockErr();
  }

  const stateCopy = cloneCursorState(state);
  state.isLocked = true;

  if (level !== levelOf(state)) {
    await moveToLevel(stateCopy, level);
  }

  stateCopy.currentIndex = bucketOf(state).nodes.length - 1;

  await moveSideways(stateCopy);

  Object.assign(state, stateCopy);
};

const ffwToTupleOnLevel = async (
  state: CursorState,
  tuple: Tuple,
  level: number,
): Promise<void> => {
  if (level > rootLevelOf(state)) {
    state.isDone = true;
  }

  if (state.isDone) {
    return;
  }

  if (state.isLocked) {
    throw failedToAquireLockErr();
  }

  const stateCopy = cloneCursorState(state);
  state.isLocked = true;

  // set to root at index matching tuple
  stateCopy.currentBuckets = [firstElement(stateCopy.currentBuckets)];
  stateCopy.currentIndex = guideByTuple(tuple)(bucketOf(stateCopy).nodes);

  // move to level if needed
  if (level < levelOf(stateCopy)) {
    await moveToLevel(stateCopy, level, guideByTuple(tuple));
  }

  Object.assign(state, stateCopy);
};
