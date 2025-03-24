/**
 * Boundary resolution similar to okra-js but considers (key, level) instead of (key, value).
 *
 * @see {@link https://github.com/canvasxyz/okra-js/blob/d3490b2c988564af2aca07996fad7b0b859a2ddd/packages/okra/src/Builder.ts#L114|okra-js implementation}
 */

import { sha256 } from "@noble/hashes/sha256";
import { MAX_UINT32 } from "./constants.js";
import type { Entry, Tuple } from "./interface.js";

export interface CreateIsBoundary {
  (average: number, level: number): IsBoundary;
}
export interface IsBoundary {
  (entry: Entry): boolean;
}

/**
 * Returns a function that determines if an entry is a boundary.
 *
 * Expects average to be a positive integer between 1 and 2^32 - 1;
 * more realistically around 30 as it represents the desired number of keys per bucket.
 * The average is used to calculate the limit as MAX_UINT32 / average.
 * The boundary is determined by hashing the level and tuple and then checking if the first four bytes fall below the limit.
 *
 * @param average
 * @param level
 * @returns
 */
export const createIsBoundary: CreateIsBoundary = (
  average: number,
  level: number,
): IsBoundary => {
  const limit = Number(MAX_UINT32 / BigInt(average));

  return ({ seq, key }: Tuple) => {
    // 1 byte for level, 8 bytes for seq, key.length bytes for key
    const bytes = new Uint8Array(9 + key.length);

    bytes[0] = level;

    for (let i = 8; i > 0; i--) {
      bytes[i] = seq & 0xff;
      seq = seq >>> 8;
    }

    bytes.set(key, 9);

    const digest = sha256(bytes);

    return (
      new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0) < limit
    );
  };
};
