import { Prefix } from "./bucket";

/**
 * Returns the element indexed at i or throws if element is undefined.
 *
 * @param array
 * @param i
 * @returns
 */
export const ithElement = <T>(array: T[], i: number): T => {
  const element = array[i];

  if (element == null) {
    throw new Error(
      `did not find any elements at index ${i}. element is undefined`,
    );
  }

  return element;
};

/**
 * Returns the first element of an array.
 *
 * @param array
 * @returns
 */
export const firstElement = <T>(array: T[]): T => ithElement(array, 0);

/**
 * Returns the last element of an array.
 *
 * @param array
 * @returns
 */
export const lastElement = <T>(array: T[]): T =>
  ithElement(array, array.length - 1);

/**
 * Returns the reverse as a new array.
 *
 * @param array
 * @returns
 */
export const toReversed = <T>(array: Array<T>): Array<T> => {
  const newArray = Array.from(array);
  newArray.reverse();
  return newArray;
};

/**
 * Returns a copied prefix at a specific level.
 *
 * @param prefix
 * @param level
 * @returns
 */
export const prefixWithLevel = <Code extends number, Alg extends number>(
  prefix: Prefix<Code, Alg>,
  level: number,
): Prefix<Code, Alg> => ({
  ...prefix,
  level,
});
