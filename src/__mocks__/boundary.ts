import { vi } from "vitest";

// mock for boundary.js
// exports a createIsBoundary function that returns true if the seq is odd and level is 0
export const createIsBoundary = vi.fn((_: number, level: number) => {
  return ({ seq }: { seq: number }) => {
    return seq % 2 === 1 && level === 0;
  };
});
