import { describe, expect, it } from "vitest";
import {
  MAX_UINT32,
  isBoundaryHash,
  isBoundaryNode,
} from "../src/boundaries.js";

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
      .to.satisfy((e: TypeError) => e instanceof TypeError);
  });
});

describe("isBoundaryNode", () => {
  const isBoundary = isBoundaryNode(average, 0);

  it("returns true when the node is a boundary", () => {
    expect(
      isBoundary({ timestamp: 1, hash: low, message: new Uint8Array() }),
    ).to.equal(true);
  });

  it("returns false when the node is a boundary", () => {
    expect(
      isBoundary({ timestamp: 1, hash: high, message: new Uint8Array() }),
    ).to.equal(false);
  });

  it("throws if average is less than 1", () => {
    expect(() => isBoundaryNode(0.0001, 0))
      .to.throw()
      .to.satisfy((e: TypeError) => e instanceof TypeError);
  });

  it("throws if average is greater than max uint32", () => {
    expect(() => isBoundaryNode(MAX_UINT32 + 1, 0))
      .to.throw()
      .to.satisfy((e: TypeError) => e instanceof TypeError);
  });

  it("throws if average is not a whole number", () => {
    expect(() => isBoundaryNode(3.14, 0))
      .to.throw()
      .to.satisfy((e: TypeError) => e instanceof TypeError);
  });
});
