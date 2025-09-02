import { Blockfetcher, ComparableKey, ProllyTree } from "../interface.js";
import {
  CursorState,
  cloneCursorState,
  createCursorState,
  getCurrentLevel,
  jumpToKeyAtLevel,
  nextAtLevel,
  nextKeyAtLevel,
  preMove,
  preWrite,
} from "./internal.js";

export {
  getCurrentBucket,
  getCurrentEntry,
  getKeyRange,
  getRootLevel,
} from "./internal.js";
export { getCurrentLevel };

export interface Cursor extends CursorState {}

/**
 * Creates a cursor.
 * Cursors are used to move around the tree and read.
 *
 * @param blockstore
 * @param tree
 * @returns
 */
export const createCursor = (
  blockstore: Blockfetcher,
  tree: ProllyTree,
): Cursor => {
  const state = createCursorState(blockstore, tree);

  return state;
};

export const cloneCursor = (cursor: Cursor): Cursor => cloneCursorState(cursor);

export const next = async (
  state: Cursor,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preMove(state, level, (state, level) => nextAtLevel(state, level, false));

export const nextBucket = async (
  state: Cursor,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preMove(state, level, (state, level) => nextAtLevel(state, level, true));

export const nextKey = async (
  state: Cursor,
  key: ComparableKey,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preMove(state, level, (state, level) => nextKeyAtLevel(state, key, level));

/**
 *
 *
 * @param state
 * @param key
 * @param level
 * @returns
 */
export const jumpTo = async (
  state: Cursor,
  key: ComparableKey,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preWrite(state, level, (state, level) => jumpToKeyAtLevel(state, key, level));
