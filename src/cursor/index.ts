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
 * Once a cursor is done (cursor.isDone === true) it cannot be moved left or right anymore, only up and down.
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

/**
 * Creates a copy of the cursor.
 *
 * @param cursor - from createCursor
 * @returns
 */
export const cloneCursor = (cursor: Cursor): Cursor => cloneCursorState(cursor);

/**
 * Moves the cursor to the next entry on the given level.
 * If the current entry on the given level is already the last entry on the level the cursor is set to done.
 *
 * @param state
 * @param level
 * @returns
 */
export const nextEntry = async (
  state: Cursor,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preMove(state, level, (state, level) => nextAtLevel(state, level, false));

/**
 * Moves the cursor to the next bucket on the given level.
 * If the current bucket on the given level is already the last bucket on the level the cursor is set to done.
 *
 * @param state - from createCursor
 * @param level
 * @returns
 */
export const nextBucket = async (
  state: Cursor,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preMove(state, level, (state, level) => nextAtLevel(state, level, true));

/**
 * Moves the cursor to the next key that is greater than or equal to the given key on the given level.
 * If the current key is already greater than or equal the cursor is not moved.
 * If the given key is greater than all keys in the tree then the cursor is moved to the last entry on the given level and set to done.
 *
 * @param state - from createCursor
 * @param key
 * @param level
 * @returns
 */
export const nextKey = async (
  state: Cursor,
  key: ComparableKey,
  level: number = getCurrentLevel(state),
): Promise<void> =>
  preMove(state, level, (state, level) => nextKeyAtLevel(state, key, level));

/**
 * JumpTo will set the cursor to any node on any level if the cursor is not done.
 * This is unlike the other methods which can only move the cursor to the right.
 * This is because JumpTo will set the cursor to root and traverse down.
 *
 * @param state - from createCursor
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
