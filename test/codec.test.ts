import { describe, expect, it } from "vitest";
import {
  decodeBucket,
  decodeNodeFirst,
  encodeBucket,
  encodeNode,
  handleBuffer,
} from "../src/codec.js";
import {
  bucket,
  bucketBytes,
  hash,
  message,
  node,
  nodeBytes,
  nodeBytes2,
  prefix,
  timestamp,
} from "./helpers/constants.js";

describe("codec", () => {
  describe("handleBuffer", () => {
    it("turns a buffer into a byte array", () => {
      const buffer = new ArrayBuffer(0);
      expect(handleBuffer(buffer)).to.deep.equal(new Uint8Array(0));
    });
  });

  describe("encodeNode", () => {
    it("turns a node into a byte array", () => {
      expect(encodeNode(timestamp, hash, message)).to.deep.equal(nodeBytes);
    });
  });

  describe("decodeNodeFirst", () => {
    it("turns a byte array into [node class, byte array] tuple", () => {
      expect(decodeNodeFirst(nodeBytes)).to.deep.equal([
        node,
        new Uint8Array(),
      ]);
      expect(decodeNodeFirst(nodeBytes2)).to.deep.equal([node, nodeBytes]);
    });
  });

  describe("encodeBucket", () => {
    it("turns a bucket into a byte array", () => {
      expect(encodeBucket(prefix, [node])).to.deep.equal(bucketBytes);
    });
  });

  describe("decodeBucket", () => {
    it("turns a byte array into a bucket", () => {
      expect(decodeBucket(bucketBytes)).to.deep.equal(bucket);
    });
  });
});
