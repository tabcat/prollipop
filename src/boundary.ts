/**
 * implements similar boundary resolution as okra-js but only considers keys
 * https://github.com/canvasxyz/okra-js/blob/d3490b2c988564af2aca07996fad7b0b859a2ddd/packages/okra/src/Builder.ts#L114
 *
 */

import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { MAX_UINT32 } from "./constants.js";
import type { Entry, Tuple } from "./interface.js";

/**
 * Returns true if digest falls below limit, false otherwise.
 * Checks first 2 bytes of digest
 *
 * @param digest
 * @param limit
 * @returns
 */
function isBoundaryHash(digest: Uint8Array, limit: number): boolean {
  if (digest.length < 4) {
    throw new TypeError(
      `Hash parameter must have a byte length greater than or equal to 4. Received key byte length: ${digest.length}`,
    );
  }

  return new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0) < limit;
}

export interface CreateIsBoundary {
  (average: number, level: number): IsBoundary;
}
export interface IsBoundary {
  (entry: Entry): boolean;
}

/**
 * Returns a function that determines if an entry is a boundary.
 * Expects average to be a positive integer under 2^32 - 1.
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

  return ({ seq, key }: Tuple) =>
    // value does not determine boundary
    isBoundaryHash(sha256(encode([level, seq, key])), limit);
};
