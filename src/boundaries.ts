import { CodeError } from "code-err";
import type { Node } from "./interface.js";

export const MAX_UINT32 = 2 ** 32 - 1;

export const INSUFFICIENT_HASH_LENGTH = "INSUFFICIENT_HASH_LENGTH";

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
    throw new CodeError("Hash must be at least 4 bytes in length", {
      code: INSUFFICIENT_HASH_LENGTH,
    });
  }

  return new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0) < limit;
}

export const isBoundaryNode =
  (average: number, level: number) =>
  (node: Node): boolean =>
    isBoundaryHash(
      level === 0 ? node.hash : node.message,
      MAX_UINT32 / average,
    );
