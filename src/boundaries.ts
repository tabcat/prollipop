import type { Node } from "./interface.js";

const MAX_UINT32 = 2 ** 32 - 1;

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
function isBoundaryHash(hash: Uint8Array, limit: number): boolean {
  return new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0) < limit;
}

export const isBoundaryNode =
  (average: number, level: number) =>
  (node: Node): boolean =>
    isBoundaryHash(
      level === 0 ? node.hash : node.message,
      MAX_UINT32 / average
    );
