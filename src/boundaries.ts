import { CodeError } from "code-err";
import type { Node } from "./interface.js";

const MAX_UINT32 = 2 ** 32 - 1;

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
function isBoundaryHash(hash: Uint8Array, limit: number): boolean {
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

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const average = 2;
  const limit = MAX_UINT32 / average;
  const low = new Uint8Array(4);
  const high = new Uint8Array(4).fill(255);

  describe("isBoundaryHash", () => {
    it("returns true when the hash is a boundary", () => {
      expect(isBoundaryHash(low, limit)).to.equal(true);
    });

    it("returns false when the hash is not a boundary", () => {
      expect(isBoundaryHash(high, limit)).to.equal(false);
    });

    it("throws if hash length is less than 4", () => {
      expect(() => isBoundaryHash(new Uint8Array(), limit))
        .to.throw()
        .and.satisfy((err: CodeError) => err.code === INSUFFICIENT_HASH_LENGTH);
    });
  });

  describe("isBoundaryNode", () => {
    const isBoundary = isBoundaryNode(average, 0)

    it('returns true when the node is a boundary', () => {
      expect(isBoundary({ timestamp: 1, hash: low, message: new Uint8Array() })).to.equal(true)
    })

    it('returns false when the node is a boundary', () => {
      expect(isBoundary({ timestamp: 1, hash: high, message: new Uint8Array() })).to.equal(false)
    })
  });
}
