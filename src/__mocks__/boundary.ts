import { vi } from "vitest";
import { Entry } from "../interface.js";

// mock for boundary.js
// exports a createIsBoundary function that returns true if the seq is odd and level is 0
export const createIsBoundary = vi.fn((_: number, level: number) => {
  return ({ key }: Entry) => {
    return (
      new DataView(key.buffer, key.byteOffset, 4).getUint32(0) % 2 === 1 &&
      level === 0
    );
  };
});
