/**
 * implements similar boundary resolution as okra-js but only considers keys
 * https://github.com/canvasxyz/okra-js/blob/d3490b2c988564af2aca07996fad7b0b859a2ddd/packages/okra/src/Builder.ts#L114
 *
 */

import { encode } from "@ipld/dag-cbor";
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
 * Expects average to be a positive integer between 1 and 2^32 - 1;
 * more realistically around 30 as it represents the desired number of keys per bucket.
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
    // boundary is determined by the level and tuple
    // this keeps boundaries consistent across different values
    const digest = sha256(encode([level, seq, key]));
    return (
      new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0) < limit
    );
  };
};
