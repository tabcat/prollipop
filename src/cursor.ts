import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import type { Blockstore } from "interface-blockstore";
import { CID, SyncMultihashHasher } from "multiformats";
import { compare } from "uint8arrays";
import { TreeCodec } from "./codec.js";
import { compareTuples } from "./compare.js";
import {
  levelExceedsRoot,
  levelIsNegative,
  levelMustChange,
} from "./errors.js";
import { Bucket, Node, ProllyTree, Tuple } from "./interface.js";
import {
  findFailureOrLastIndex,
  loadBucket,
  prefixWithLevel,
} from "./utils.js";

export interface Cursor<Code extends number, Alg extends number> {
  current(): Node;
  level(): number;
  path(): CID[];
  buckets(): Bucket<Code, Alg>[];
  next(): Promise<void>;
  nextAtLevel(level: number): Promise<void>;
  done(): boolean;
}

export interface CursorState<Code extends number, Alg extends number> {
  blockstore: Blockstore;
  codec: TreeCodec<Code, Alg>;
  hasher: SyncMultihashHasher<Alg>;
  currentBuckets: Bucket<Code, Alg>[];
  currentIndex: number;
  isDone: boolean;
}

export const createCursorState = <Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  currentBuckets: Bucket<Code, Alg>[] = [tree.root],
  currentIndex?: number,
): CursorState<Code, Alg> => ({
  blockstore,
  codec: tree.getCodec(),
  hasher: tree.getHasher(),
  currentBuckets,
  currentIndex:
    currentIndex ?? Math.min(0, lastElement(currentBuckets).nodes.length - 1),
  isDone: false,
});

export const cloneCursorState = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): CursorState<Code, Alg> => ({
  ...state,
  currentBuckets: Array.from(state.currentBuckets),
});

export const levelOf = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): number => bucketOf(state).prefix.level;

export const bucketOf = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Bucket<Code, Alg> => lastElement(state.currentBuckets);

export const nodeOf = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Node => ithElement(bucketOf(state).nodes, state.currentIndex);

export const pathOf = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): CID[] => state.currentBuckets.map((bucket) => bucket.getCID());

export const rootLevelOf = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): number => firstElement(state.currentBuckets).prefix.level;

export const lastOf = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Node => lastElement(bucketOf(state).nodes);

export const getIsExtremity = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
  findExtemity: (nodes: Node[]) => Node, // firstElement or lastElement
): boolean => {
  let lastBucket: Bucket<Code, Alg> | null = null;
  let i = state.currentBuckets.length - 1;

  // traverse from level 0
  while (i >= 0) {
    const bucket = ithElement(state.currentBuckets, i);

    // skips level 0
    if (
      lastBucket != null &&
      compare(findExtemity(bucket.nodes).message, lastBucket.getHash()) !== 0
    ) {
      return false;
    }

    lastBucket = bucket;
    i--;
  }

  return true;
};

export const getIsTail = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): boolean => getIsExtremity(state, firstElement);
export const getIsHead = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): boolean => getIsExtremity(state, lastElement);

/**
 * Returns whether increasing the currentIndex will overflow the bucket.
 *
 * @param state - the state of the cursor
 * @returns
 */
const overflows = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): boolean => state.currentIndex === bucketOf(state).nodes.length - 1;

export const defaultGuide =
  (target: Tuple) =>
  (nodes: Node[]): number =>
    findFailureOrLastIndex(nodes, (n) => compareTuples(target, n) > 0);

export const moveToLevel = async <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
  level: number,
  _guide?: (nodes: Node[]) => number,
): Promise<void> => {
  if (levelOf(state) === level) {
    throw levelMustChange(level);
  }

  if (level < 0) {
    throw levelIsNegative();
  }

  if (level > rootLevelOf(state)) {
    throw levelExceedsRoot(level, rootLevelOf(state));
  }

  // guides currentIndex during traversal
  const guide: (nodes: Node[]) => number =
    _guide ?? defaultGuide(nodeOf(state));

  const stateCopy: CursorState<Code, Alg> = { ...state };

  while (level !== levelOf(stateCopy)) {
    if (level > levelOf(stateCopy)) {
      // jump to level
      const difference = levelOf(stateCopy) - level;

      stateCopy.currentBuckets.splice(difference, -difference);
    } else {
      // walk to level
      const digest = nodeOf(stateCopy).message;

      stateCopy.currentBuckets.push(
        await loadBucket(
          stateCopy.blockstore,
          digest,
          prefixWithLevel(bucketOf(stateCopy).prefix, levelOf(stateCopy) - 1),
          state.codec,
          state.hasher,
        ),
      );
    }

    // set to index of node which is greater than or equal to target
    stateCopy.currentIndex = guide(bucketOf(stateCopy).nodes);
  }

  Object.assign(state, stateCopy);
};

export const moveSideways = async <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Promise<void> => {
  const stateCopy = cloneCursorState(state);

  // find a level which allows increasing currentIndex
  while (overflows(stateCopy)) {
    // cannot increase currentIndex anymore, so done
    if (stateCopy.currentBuckets.length === 1) {
      state.isDone = true;
      return;
    }

    await moveToLevel(stateCopy, levelOf(stateCopy) + 1);
  }

  stateCopy.currentIndex += 1;

  // get back to same level
  while (levelOf(stateCopy) !== levelOf(state)) {
    await moveToLevel(
      stateCopy,
      levelOf(state),
      () => 0, // always first index when descending
    );
  }

  Object.assign(state, stateCopy);
};

export const moveToTupleOnLevel = async <
  Code extends number,
  Alg extends number,
>(
  state: CursorState<Code, Alg>,
  tuple: Tuple,
  level: number,
): Promise<void> => {
  const stateCopy = cloneCursorState(state);

  // move up until finding a node greater than tuple
  while (
    compareTuples(tuple, lastOf(state)) > 0 &&
    levelOf(state) < rootLevelOf(state)
  ) {
    await moveToLevel(state, levelOf(state) + 1, defaultGuide(tuple));
  }

  // move to level targeting tuple
  if (levelOf(state) !== level) {
    await moveToLevel(state, level, defaultGuide(tuple));
  }

  Object.assign(state, stateCopy);
};

export const moveToNextBucket = async <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Promise<void> => {
  const stateCopy = cloneCursorState(state);

  stateCopy.currentIndex = bucketOf(state).nodes.length - 1;

  await moveSideways(stateCopy);

  Object.assign(state, stateCopy);
};

export const createNextOnLevel =
  <Code extends number, Alg extends number>(state: CursorState<Code, Alg>) =>
  async (level: number): Promise<void> => {
    if (level > rootLevelOf(state)) {
      state.isDone = true;
    }

    if (state.isDone) {
      return;
    }

    const stateCopy = cloneCursorState(state);

    if (level > levelOf(stateCopy)) {
      await moveToLevel(stateCopy, level);
      await moveSideways(stateCopy);
    } else if (level < levelOf(stateCopy)) {
      // result of right side backbone
      await moveToLevel(stateCopy, level, () => 0);
    } else {
      await moveSideways(stateCopy);
    }

    Object.assign(state, stateCopy);
  };

export function createCursorFromState<Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Cursor<Code, Alg> {
  const nextAtLevel = createNextOnLevel(state);

  if (state.currentIndex === -1) {
    state.isDone = true;
  }

  return {
    path: () => pathOf(state),
    buckets: () => state.currentBuckets,
    current: () => nodeOf(state),
    level: () => levelOf(state),
    done: () => state.isDone,
    // don't use these methods concurrently
    next: () => nextAtLevel(levelOf(state)),
    nextAtLevel,
  };
}

export function createCursor<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
): Cursor<Code, Alg> {
  const state = createCursorState(blockstore, tree);
  return createCursorFromState(state);
}
