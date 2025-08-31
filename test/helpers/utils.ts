import { IsBoundary } from "../../src/boundary.js";
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

export const createBoundaryEntry = (
  i: number,
  isBoundary: IsBoundary,
): Entry => {
  while (true) {
    const entry = createEntry(i);

    if (isBoundary(entry)) {
      return entry;
    } else {
      i++;
    }
  }
};
