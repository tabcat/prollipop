export const DEFAULT_AVERAGE = 32;
export const MAX_UINT32 = (1n << 32n) - 1n;
export const MAX_LEVEL = 30;

/**
 * A tuple that is less than all other tuples.
 * Normally a tuple seq is a positive integer.
 * This is not valid for an entry but can be used for comparisons and Tuple Ranges.
 */
export const minTuple = { seq: -1, key: new Uint8Array(0) };
