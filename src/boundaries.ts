import type { Node } from "./interface.js";
import { createNamedErrorClass } from "./internal.js";

export const BoundaryError = createNamedErrorClass("BoundaryError");

/**
 * Returns true if hash meets 1/average threshold, false otherwise
 * Checks first 2 bytes of hash
 *
 * implements same boundary resolution as okra-js
 * https://github.com/canvasxyz/okra-js/blob/d3490b2c988564af2aca07996fad7b0b859a2ddd/packages/okra/src/Builder.ts#L114
 *
 * @param average - average number of nodes in each bucket
 * @param hash - hash from key (leaf) or value of node (branch)
 * @returns
 */
export function isBoundaryHash(hash: Uint8Array, limit: number): boolean {
  if (hash.length < 4) {
    throw new BoundaryError(
      `Hash parameter must have a byte length greater than or equal to 4. Received hash byte length: ${hash.length}`,
    );
  }

  return new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0) < limit;
}

export const MAX_UINT32 = 2 ** 32 - 1;

export const isBoundaryNode = (
  average: number,
  level: number,
): ((node: Node) => boolean) => {
  if (average < 1) {
    throw new BoundaryError(
      `Average parameter must be greater than or equal to 1. Received average: ${average}`,
    );
  }

  if (average > MAX_UINT32) {
    throw new BoundaryError(
      `Average parameter must be less than max uint32. Received average: ${average}`,
    );
  }

  if (average % 1 !== 0) {
    throw new BoundaryError(
      `Average parameter must be a whole number. Received average: ${average}`,
    );
  }

  return (node) =>
    isBoundaryHash(
      level === 0 ? node.hash : node.message,
      MAX_UINT32 / Math.max(average, 1),
    );
};
