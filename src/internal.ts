import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { SyncMultihashHasher } from "multiformats/interface";
import { Prefix } from "./interface.js";

/**
 * Returns the index of the first element to fail a test.
 * If no failure is found then it returns the length of the array.
 *
 * @param array
 * @param test
 * @returns
 */
export const findFailure = <T>(
  array: Array<T>,
  test: (element: T) => boolean,
): number => {
  let i = 0;

  for (const element of array) {
    if (test(element) === false) {
      return i;
    }

    i++;
  }

  return i;
};

export const findFailureOrLastIndex = <T>(
  array: Array<T>,
  test: (element: T) => boolean,
): number => {
  if (array.length === 0) {
    throw new TypeError("Received empty array.");
  }

  return Math.min(array.length - 1, findFailure(array, test));
};

/**
 * Returns a new prefix object set to a specific level.
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

export const bucketDigestToCid =
  <Code extends number, Alg extends number>(prefix: Prefix<Code, Alg>) =>
  (digest: Uint8Array): CID =>
    CID.createV1(prefix.mc, createMultihashDigest(prefix.mh, digest));

export const bucketCidToDigest = (cid: CID): Uint8Array => cid.multihash.digest;

export const bucketBytesToDigest = <Alg extends number>(
  bytes: Uint8Array,
  hasher: SyncMultihashHasher<Alg>,
): Uint8Array => hasher.digest(bytes).digest;

/**
 * Creates a new NamedError class that uses the name parameter as the name property of the Error instance.
 *
 * @param name - Specifies the string to set as the .name property.
 * @returns
 */
export const createNamedErrorClass = (name: string) =>
  class NamedError extends Error {
    constructor(message?: string, options?: ErrorOptions) {
      super(message, options);
      this.name = name;
    }
  };
