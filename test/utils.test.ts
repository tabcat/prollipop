import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it } from "vitest";
import {
  bucketDigestToCid,
  bucketToPrefix,
  createBucket,
  entryToTuple,
  loadBucket,
} from "../src/utils.js";
import {
  average,
  bucket,
  emptyBucket,
  entry,
  level,
  prefix,
  tuple,
} from "./helpers/constants.js";

describe("utils", () => {
  describe("bucketDigestToCid", () => {
    it("returns the cid for a given bucket hash", () => {
      expect(bucketDigestToCid(bucket.getDigest())).to.deep.equal(
        bucket.getCID(),
      );
    });
  });

  describe("entryToTuple", () => {
    it("returns a new tuple from a entry", () => {
      expect(entryToTuple(entry)).to.deep.equal(tuple);
    });
  });

  describe("bucketToPrefix", () => {
    it("returns a new prefix from a bucket", () => {
      expect(bucketToPrefix(bucket)).to.deep.equal(prefix);
    });
  });

  describe("createBucket", () => {
    it("returns a bucket", () => {
      expect(createBucket(average, level, [entry])).to.deep.equal(bucket);
    });
  });

  describe("loadBucket", () => {
    const blockstore = new MemoryBlockstore();
    blockstore.put(bucket.getCID(), bucket.getBytes());

    it("returns a bucket from a blockstore for the given hash", async () => {
      expect(
        await loadBucket(blockstore, bucket.getDigest(), prefix),
      ).to.deep.equal(bucket);
    });

    it("throws if bucket is not found in blockstore", () => {
      const blockstore = new MemoryBlockstore();
      expect(() =>
        loadBucket(blockstore, bucket.getDigest(), prefix),
      ).rejects.toSatisfy((e) => e instanceof Error);
    });

    it("throws if bucket level mismatches level of expected prefix", () => {
      expect(() =>
        loadBucket(blockstore, bucket.getDigest(), { ...prefix, level: 1 }),
      ).rejects.toSatisfy((e) => e instanceof TypeError);
    });

    it("throws if bucket key does not match requested hash", () => {
      const blockstore = new MemoryBlockstore();
      blockstore.put(emptyBucket.getCID(), bucket.getBytes());
      expect(() =>
        loadBucket(blockstore, emptyBucket.getDigest(), prefix),
      ).rejects.toSatisfy((e) => e instanceof Error);
    });
  });
});
