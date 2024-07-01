import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import type { Blockstore } from "interface-blockstore";
import { CID, SyncMultihashHasher } from "multiformats";
import { TreeCodec } from "./codec.js";
import { compareTuples, findIndexGTE } from "./compare.js";
import { Bucket, Node, ProllyTree, Tuple } from "./interface.js";
import { bucketDigestToCid, loadBucket, prefixWithLevel } from "./utils.js";

export interface Cursor<Code extends number, Alg extends number> {
  current(): Node;
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
  currentIndex: number = 0,
): CursorState<Code, Alg> => ({
  blockstore,
  codec: tree.getCodec(),
  hasher: tree.getHasher(),
  currentBuckets,
  currentIndex,
  isDone: false,
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

const getIsExtremity = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
  findExtemity: (nodes: Node[]) => Node,
): boolean => {
  const currentBucketsItorator = state.currentBuckets[Symbol.iterator]();

  let lastBucket: Bucket<Code, Alg> = currentBucketsItorator.next().value;
  for (const bucket of currentBucketsItorator) {
    if (
      !bucketDigestToCid(lastBucket.prefix)(
        findExtemity(lastBucket.nodes).message,
      ).equals(bucket.getCID())
    ) {
      return false;
    }

    lastBucket = bucket;
  }

  return true;
};

export const getIsTail = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): boolean => getIsExtremity(state, firstElement);
export const getIsHead = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): boolean => getIsExtremity(state, lastElement);

const cursorErrorCodesList = [
  "LEVEL_IS_NEGATIVE",
  "LEVEL_EXCEEDS_ROOT",
  "LEVELS_MUST_BE_UNEQUAL",
] as const;

type CursorErrorCode = (typeof cursorErrorCodesList)[number];

export const cursorErrorCodes: { [key in CursorErrorCode]: CursorErrorCode } =
  Object.fromEntries(cursorErrorCodesList.map((code) => [code, code])) as {
    [key in CursorErrorCode]: CursorErrorCode;
  };

/**
 * Returns whether increasing the currentIndex will overflow the bucket.
 *
 * @param state - the state of the cursor
 * @returns
 */
const overflows = <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): boolean => state.currentIndex === bucketOf(state).nodes.length - 1;

export const moveToLevel = async <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
  level: number,
  _target?: Tuple,
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

  // tuple to use as guide
  const target = _target ?? nodeOf(state);

  const stateCopy: CursorState<Code, Alg> = { ...state };

  while (level !== levelOf(stateCopy)) {
    if (level > levelOf(stateCopy)) {
      // jump to level
      const difference = levelOf(stateCopy) - level - 1;

      stateCopy.currentBuckets = stateCopy.currentBuckets.splice(
        -difference,
        difference,
      );
    } else {
      // walk to level
      const digest = ithElement(
        bucketOf(state).nodes,
        stateCopy.currentIndex,
      ).message;

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

    stateCopy.currentIndex = findIndexGTE(bucketOf(state).nodes, target);
  }

  Object.assign(state, stateCopy);
};

export const moveSideways = async <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Promise<void> => {
  const stateCopy = { ...state };

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
      bucketOf(state).nodes[state.currentIndex], // use original tuple as target
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
  const stateCopy = { ...state };

  // move up until finding a node greater than tuple
  while (
    compareTuples(tuple, lastOf(state)) > 0 &&
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

export const moveToNextBucket = async <Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Promise<void> => {
  const stateCopy = { ...state };

  stateCopy.currentIndex = bucketOf(state).nodes.length - 1;

  await moveSideways(stateCopy);

  Object.assign(state, stateCopy);
};

const createNextOnLevel =
  <Code extends number, Alg extends number>(state: CursorState<Code, Alg>) =>
  async (level: number): Promise<void> => {
    if (level > rootLevelOf(state)) {
      state.isDone = true;
    }

    if (state.isDone) return;

    const stateCopy = { ...state };

    if (levelOf(stateCopy) !== level) {
      await moveToLevel(stateCopy, level);
    }

    await moveSideways(stateCopy);

    if (levelOf(stateCopy) !== levelOf(state)) {
      await moveToLevel(stateCopy, levelOf(state), {
        timestamp: 0,
        hash: new Uint8Array(nodeOf(state).hash.length),
      });
    }

    Object.assign(state, stateCopy);
  };

export function createCursorFromState<Code extends number, Alg extends number>(
  state: CursorState<Code, Alg>,
): Cursor<Code, Alg> {
  const nextAtLevel = createNextOnLevel(state);

  state.currentIndex = bucketOf(state).nodes.length - 1;

  if (firstElement(state.currentBuckets).nodes.length === 0) {
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

export function createCursor<Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
): Cursor<Code, Alg> {
  const state = createCursorState(blockstore, tree);
  return createCursorFromState(state);
}
