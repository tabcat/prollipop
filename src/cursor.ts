import { CID, SyncMultihashHasher } from "multiformats";
import type { Blockstore } from "interface-blockstore";
import { Prefix, digest2cid, loadBucket, type Bucket } from "./bucket";
import {
  findIndexClosestToGTE,
  type Tuple,
  type Node,
  compareTuples,
} from "./node";
import { firstElement, lastElement, prefixWithLevel } from "./util";
import { BlockCodecPlus } from "./codec";

export interface Cursor {
  current(): Node;
  path(): CID[];
  buckets(): Bucket[];
  next(): Promise<void>;
  nextAtLevel(level: number): Promise<void>;
  done(): boolean;
}

export interface CursorState {
  blockstore: Blockstore;
  codec: BlockCodecPlus<number, any>;
  hasher: SyncMultihashHasher<number>;
  currentBuckets: Bucket[];
  currentIndex: number;
  isDone: boolean;
}

export const createCursorState = (
  blockstore: Blockstore,
  codec: BlockCodecPlus<number, any>,
  hasher: SyncMultihashHasher<number>,
  currentBuckets: Bucket[],
  currentIndex: number = 0
): CursorState => ({
  blockstore,
  codec,
  hasher,
  currentBuckets,
  currentIndex,
  isDone: false,
});

export const levelOf = (state: CursorState): number =>
  bucketOf(state).prefix.level;

export const bucketOf = (state: CursorState): Bucket =>
  lastElement(state.currentBuckets);

export const nodeOf = (state: CursorState): Node =>
  bucketOf(state).nodes[state.currentIndex];

export const pathOf = (state: CursorState): CID[] =>
  state.currentBuckets.map((bucket) => bucket.getCID());

export const rootLevelOf = (state: CursorState): number =>
  state.currentBuckets[0].prefix.level;

export const firstOf = (state: CursorState): Node =>
  firstElement(bucketOf(state).nodes);

export const lastOf = (state: CursorState): Node =>
  lastElement(bucketOf(state).nodes);

export const prefixOf = (state: CursorState): Prefix => bucketOf(state).prefix;

const getIsExtremity = (
  state: CursorState,
  findExtemity: (nodes: Node[]) => Node
): boolean => {
  const currentBucketsItorator = state.currentBuckets[Symbol.iterator]();

  let lastBucket: Bucket = currentBucketsItorator.next().value;
  for (const bucket of currentBucketsItorator) {
    if (
      !digest2cid(lastBucket.prefix)(
        findExtemity(lastBucket.nodes).message
      ).equals(bucket.getCID())
    ) {
      return false;
    }

    lastBucket = bucket;
  }

  return true;
};

export const getIsTail = (state: CursorState): boolean =>
  getIsExtremity(state, firstElement);
export const getIsHead = (state: CursorState): boolean =>
  getIsExtremity(state, lastElement);

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

const NEXT = "next" as const;
const PREV = "prev" as const;
type Direction = typeof NEXT | typeof PREV;

/**
 * Returns whether moving in a direction will overflow the bucket.
 *
 * @param state - the state of the cursor
 * @param direction - the direction to move the cursor
 * @returns
 */
const overflows = (state: CursorState, direction: Direction): boolean => {
  if (direction === NEXT) {
    return state.currentIndex === bucketOf(state).nodes.length - 1;
  }

  if (direction === PREV) {
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
    throw new Error("no negative levels");
  }

  if (level > rootLevelOf(state)) {
    throw new Error("level is higher than level of tree root");
  }

  if (level === levelOf(state)) {
    throw new Error("should only be used when having to change levels");
  }

  // tuple to use as direction
  const target = _target ?? bucketOf(state)[state.currentIndex];

  const stateCopy = { ...state };

  while (level !== levelOf(stateCopy)) {
    if (level > levelOf(stateCopy)) {
      // jump to level
      const difference = levelOf(stateCopy) - level - 1;

      stateCopy.currentBuckets = stateCopy.currentBuckets.splice(
        -difference,
        difference
      );
    } else {
      // walk to level
      const digest = bucketOf(state).nodes[stateCopy.currentIndex].message;

      stateCopy.currentBuckets.push(
        await loadBucket(
          stateCopy.blockstore,
          digest,
          prefixWithLevel(prefixOf(stateCopy), levelOf(stateCopy) - 1),
          state.codec,
          state.hasher
        )
      );
    }

    stateCopy.currentIndex = findIndexClosestToGTE(
      bucketOf(state).nodes,
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
    if (stateCopy.currentBuckets.length === 1) {
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
      bucketOf(state).nodes[state.currentIndex] // use original tuple as target
    );
  }

  Object.assign(state, stateCopy);
};

export const moveToTupleOnLevel = async (
  state: CursorState,
  tuple: Tuple,
  level: number
): Promise<void> => {
  const stateCopy = { ...state };

  // move up until finding a node greater than tuple
  while (
    compareTuples(lastOf(state), tuple) < 0 &&
    levelOf(state) < rootLevelOf(state)
  ) {
    await moveToLevel(state, levelOf(state) + 1, tuple);
  }

  // move to level targeting tuple
  if (levelOf(state) !== level) {
    await moveToLevel(state, level, tuple);
  }

  Object.assign(state, stateCopy);
};

const createNextOnLevel =
  (state: CursorState) =>
  (direction: Direction, minTuple: Tuple) =>
  async (level: number): Promise<void> => {
    if (level > rootLevelOf(state)) {
      state.isDone = true;
    }

    if (state.isDone) return;

    const stateCopy = { ...state };

    if (levelOf(stateCopy) !== level) {
      await moveToLevel(stateCopy, level);
    }

    await moveSideways(stateCopy, direction);

    if (levelOf(stateCopy) !== levelOf(state)) {
      await moveToLevel(stateCopy, levelOf(state), minTuple);
    }

    Object.assign(state, stateCopy);
  };

export const minTuples = {
  [NEXT]: { timestamp: 0, hash: new Uint8Array(32) },
  [PREV]: { timestamp: Infinity, hash: Uint8Array.from(Array(32).fill([255])) },
};

export function createCursorFromState(state: CursorState): Cursor {
  const nextAtLevel = createNextOnLevel(state)(NEXT, minTuples[NEXT]);

  state.currentIndex = bucketOf(state).nodes.length - 1;

  if (state.currentBuckets[0].nodes.length === 0) {
    state.isDone = true;
    state.currentIndex = -1; // keeps index equal to length - 1
  }

  return {
    path: () => pathOf(state),
    buckets: () => state.currentBuckets,
    current: () => nodeOf(state),
    done: () => state.isDone,
    // don't use these methods concurrently
    next: () => nextAtLevel(levelOf(state)),
    nextAtLevel,
  };
}

export function createCursor(
  blockstore: Blockstore,
  codec: BlockCodecPlus<number, any>,
  hasher: SyncMultihashHasher<number>,
  rootBucket: Bucket
): Cursor {
  const state = createCursorState(blockstore, codec, hasher, [rootBucket]);
  return createCursorFromState(state);
}
