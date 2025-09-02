import { createIsBoundary } from "../../src/boundary.js";
import { EncodedEntry } from "../../src/codec.js";
import { DefaultEntry } from "../../src/impls.js";
import { Entry } from "../../src/interface.js";

export const numberToBytes = (n: number): Uint8Array => {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, n, false);
  return new Uint8Array(buf);
};

export const bytesToNumber = (bytes: Uint8Array): number => {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
};

export const createKey = (id: number) => numberToBytes(id);

export const createEntry = (id: number, val: number = 0) =>
  new DefaultEntry(createKey(id), numberToBytes(val));

export const createEncodedEntry = (
  id: number,
  val: number = 0,
): EncodedEntry => [numberToBytes(id), numberToBytes(val)];

/**
 * Creates a boundary entry on a requested level.
 *
 * @param average
 * @param level - The level you want the entry to be a boundary on. -1 for non-boundary on level 0.
 * @param id
 * @param val
 * @returns
 */
export const createBoundaryEntry = (
  average: number,
  level: number,
  id: number,
  val: number = 0,
): [Entry, number] => {
  let l = 0;

  let i = 0;
  while (i < 10000) {
    const isBoundary = createIsBoundary(average, l);
    const entry = createEntry(id, val);

    if (isBoundary(entry)) {
      if (l > level + 1) {
        // >= does not cover level === -1 case
        l = 0;
        id++;
      } else {
        l++;
      }
    } else {
      if (l === level + 1) {
        return [entry, id];
      } else {
        l = 0;
        id++;
      }
    }
  }

  throw new Error("could not find boundary. check average parameter");
};

const verifyStructure = (structure: number[]) => {
  let max = 0;
  let maxCount = 0;

  for (const n of structure) {
    if (n > max) {
      max = n;
    }

    if (n === max) {
      maxCount++;
    }
  }

  if ((max > 0 && maxCount < 2) || structure[structure.length - 1] !== max) {
    throw new Error("invalid structure");
  }
};

/**
 * Builds a tree with a desired structure.
 *
 * @param structure - any array encodes the level each entry should exist on. [0, 0, 1, 0, 0, 1] would be a bucket
 * @returns
 */
export const treeMaker = (structure: number[]) => {
  verifyStructure(structure);
};
