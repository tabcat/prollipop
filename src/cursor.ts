import { CID } from "multiformats";
import type { Blockstore } from "interface-blockstore";
import { Prefix, digest2cid, loadBucket, type Bucket } from "./bucket";
import { findIndexClosestToGTE, type Tuple, type Node } from "./node";
import { lastElement, prefixWithLevel } from "./util";

export interface Cursor {
  current(): Node;
  path(): CID[]; // has to include current bucket ?
  next(): Promise<void>;
  nextAtLevel(level: number): Promise<void>;
  done(): boolean;
}

export interface CursorState {
  blockstore: Blockstore;
  currentBucket: Bucket;
  currentPath: CID[];
  currentIndex: number;
  isDone: boolean;
}

export const createCursorState = (
  blockstore: Blockstore,
  currentBucket: Bucket,
  currentPath: CID[] = [currentBucket.getCID()],
  currentIndex: number = 0
): CursorState => ({
  blockstore,
  currentPath,
  currentBucket,
  currentIndex,
  isDone: false,
});

export const levelOf = (state: CursorState): number =>
  state.currentBucket.prefix.level;

export const rootLevelOf = (state: CursorState): number =>
  levelOf(state) + Math.max(0, state.currentPath.length - 1);

export const firstOf = (state: CursorState): Node =>
  state.currentBucket.nodes[0];

export const currentOf = (state: CursorState): Node =>
  state.currentBucket.nodes[state.currentIndex];

export const lastOf = (state: CursorState): Node =>
  state.currentBucket.nodes[state.currentBucket.nodes.length - 1];

export const prefixOf = (state: CursorState): Prefix =>
  state.currentBucket.prefix;

const cursorErrorCodesList = [
  "UNKNOWN_DIRECTION",
  "LEVEL_IS_NEGATIVE",
  "LEVEL_EXCEEDS_ROOT",
  "LEVELS_MUST_BE_UNEQUAL",
] as const;

type CursorErrorCode = (typeof cursorErrorCodesList)[number];

export const cursorErrorCodes: { [key in CursorErrorCode]: CursorErrorCode } =
  Object.fromEntries(cursorErrorCodesList.map((code) => [code, code])) as {
    [key in CursorErrorCode]: CursorErrorCode;
  };

type Direction = "prev" | "next";
const NEXT = "next" as const;
const PREV = "prev" as const;

/**
 * Returns whether moving in a direction will overflow the bucket.
 *
 * @param state - the state of the cursor
 * @param direction - the direction to move the cursor
 * @returns
 */
const overflows = (state: CursorState, direction: Direction): boolean => {
  if (direction === "next") {
    return state.currentBucket.nodes.length === state.currentIndex + 1;
  }

  if (direction === "prev") {
    return state.currentIndex === 0;
  }

  throw new Error("unknown direction");
};

export const moveToLevel = async (
  state: CursorState,
  level: number,
  _target?: Tuple
): Promise<void> => {
  if (levelOf(state) < 0) {
    throw new Error('no negative levels')
  }

  if (level > rootLevelOf(state)) {
    throw new Error("level is higher than level of tree root");
  }

  if (level === levelOf(state)) {
    throw new Error("should only be used when having to change levels");
  }

  const target = _target ?? state.currentBucket[state.currentIndex];

  const stateCopy = { ...state };

  while (level !== levelOf(stateCopy)) {
    if (level > levelOf(stateCopy)) {
      // jump to level
      const difference = levelOf(stateCopy) - level - 1;

      stateCopy.currentPath = stateCopy.currentPath.slice(0, difference);
      stateCopy.currentBucket = await loadBucket(
        stateCopy.blockstore,
        lastElement(stateCopy.currentPath),
        prefixWithLevel(prefixOf(stateCopy), levelOf(stateCopy) + difference)
      );
    } else {
      // walk to level
      const digest =
        stateCopy.currentBucket.nodes[stateCopy.currentIndex].message;
      const cid = digest2cid(prefixOf(stateCopy))(digest); // need to double check digest, probably need to store hash size in prefix

      stateCopy.currentPath = [...stateCopy.currentPath, cid];
      stateCopy.currentBucket = await loadBucket(
        stateCopy.blockstore,
        cid,
        prefixWithLevel(prefixOf(stateCopy), levelOf(stateCopy) - 1)
      );
    }

    stateCopy.currentIndex = findIndexClosestToGTE(
      stateCopy.currentBucket.nodes,
      target
    );
  }

  Object.assign(state, stateCopy);
};

export const moveSideways = async (
  state: CursorState,
  direction: Direction
): Promise<void> => {
  const stateCopy = { ...state };

  // find a level which allows for moving in that direction
  while (overflows(stateCopy, direction)) {
    // cannot move next anymore, so done
    if (stateCopy.currentPath.length === 1) {
      state.isDone = true;
      return;
    }

    await moveToLevel(stateCopy, levelOf(stateCopy) + 1);
  }

  if (direction === NEXT) {
    stateCopy.currentIndex += 1;
  } else if (direction === PREV) {
    stateCopy.currentIndex -= 1;
  } else {
    throw new Error("unknown direction given");
  }

  // get back to same level
  while (levelOf(stateCopy) !== levelOf(state)) {
    await moveToLevel(
      stateCopy,
      levelOf(state),
      state.currentBucket.nodes[state.currentIndex] // use original tuple as target
    );
  }

  Object.assign(state, stateCopy);
};

const createNextOnLevel =
  (state: CursorState) =>
  (direction: Direction, minTuple: Tuple) =>
  async (level: number): Promise<void> => {
    if (level > rootLevelOf(state)) {
      state.isDone = true
    }

    if (state.isDone) return

    const stateCopy = { ...state };

    if (levelOf(stateCopy) !== level) {
      await moveToLevel(stateCopy, level);
    }

    await moveSideways(stateCopy, direction);

    if (levelOf(stateCopy) !== levelOf(state)) {
      await moveToLevel(stateCopy, levelOf(state), minTuple)
    }

    Object.assign(state, stateCopy);
  };

export const minTuples = {
  [NEXT]: { timestamp: 0, hash: new Uint8Array(32) },
  [PREV]: { timestamp: Infinity, hash: Uint8Array.from(Array(32).fill([255])) }
}

export function create(
  blockstore: Blockstore,
  rootBucket: Bucket,
  direction: Direction = NEXT,
): Cursor {
  const state = createCursorState(blockstore, rootBucket);
  
  if (direction === PREV) {
    state.currentIndex = state.currentBucket.nodes.length - 1
  }

  const nextAtLevel = createNextOnLevel(state)(direction, minTuples[direction]);

  // empty tree, no nodes to read
  if (state.currentBucket.nodes.length === 0) {
    state.isDone = true
    state.currentIndex = -1
  }
  
  return {
    path: () => state.currentPath,
    current: () => currentOf(state),
    done: (): boolean => state.isDone,
    // don't use these methods concurrently
    next: () => nextAtLevel(levelOf(state)),
    nextAtLevel,
  }
}
