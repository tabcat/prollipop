export const DEFAULT_AVERAGE = 32;
export const MAX_UINT32 = (1n << 32n) - 1n;

/**
 * Max tree level.
 */
export const MAX_LEVEL = 10;

/**
 * Utility tuples. Not valid for anything but use with sorting.
 */
export const MIN_TUPLE = { seq: -1, key: new Uint8Array(0) };
export const MAX_TUPLE = { seq: Infinity, key: new Uint8Array(0) };
