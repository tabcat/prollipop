import { CID } from "multiformats";
import type { Node } from "./node.js";

/**
 * Returns true if hash meets 1/average threshold, false otherwise
 * Checks first 2 bytes of hash
 *
 * @param average - average number of nodes in each bucket
 * @param hash - hash from key (leaf) or value of node (branch)
 * @returns
 */
function isBoundaryHash(average: number, hash: Uint8Array): boolean {
  if (hash.length !== 32) {
    throw new Error("hash should have length 32.");
  }

  const MAX_UINT32 = 2n ** 32n - 1n;
  const threshold = MAX_UINT32 / BigInt(average);

  const hashUint32 = new Uint8Array(4);
  const u32 = (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];

  // Use >>> 0 to ensure the result is an unsigned 32-bit integer
  return u32 >>> 0 < threshold;
}

export const isBoundaryNode =
  (average: number, level: number) =>
  (node: Node): boolean => {
    if (level === 0) {
      return isBoundaryHash(average, node.hash);
    } else {
      let cid: CID;
      try {
        cid = CID.decode(node.message);
      } catch (e) {
        throw new Error("unable to decode node.message cid");
      }

      return isBoundaryHash(average, cid.multihash.digest);
    }
  };
