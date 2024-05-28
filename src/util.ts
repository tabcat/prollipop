import { Prefix } from "./bucket";

/**
 * Returns the last element of an array.
 *
 * @param array
 * @returns
 */
export const lastElement = <T>(array: T[]): T => array[array.length - 1];

/**
 * Returns the reverse as a new array.
 * 
 * @param array 
 * @returns 
 */
export const toReversed = <T>(array: Array<T>): Array<T> => {
  const newArray = Array.from(array)
  newArray.reverse()
  return newArray
}

export const prefixWithLevel = (prefix: Prefix, level: number): Prefix => ({
  ...prefix,
  level,
});
