/**
 * implements similar boundary resolution as okra-js but only considering keys
 * https://github.com/canvasxyz/okra-js/blob/d3490b2c988564af2aca07996fad7b0b859a2ddd/packages/okra/src/Builder.ts#L114
 *
 */

import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import type { Node, Tuple } from "./interface.js";

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
      `Hash parameter must have a byte length greater than or equal to 4. Received hash byte length: ${digest.length}`,
    );
  }

  return new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0) < limit;
}

const MAX_UINT32 = 1n << 32n;

export const createIsBoundary = (
  average: number,
  level: number,
): ((node: Node) => boolean) => {
  if (average < 1) {
    throw new TypeError(
      `Average parameter must be greater than or equal to 1. Received average: ${average}`,
    );
  }

  if (average > MAX_UINT32) {
    throw new TypeError(
      `Average parameter must be less than max uint32. Received average: ${average}`,
    );
  }

  if (average % 1 !== 0) {
    throw new TypeError(
      `Average parameter must be a whole number. Received average: ${average}`,
    );
  }

  const limit = Number(MAX_UINT32 / BigInt(average));

  return ({ seq: timestamp, key: hash }: Tuple) =>
    // value does not determine boundary
    isBoundaryHash(sha256(encode([level, timestamp, hash])), limit);
};
