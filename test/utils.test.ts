import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it } from "vitest";
import {
  errNotFound,
  unexpectedBucketHash,
  unexpectedBucketLevel,
} from "../src/errors.js";
import { DefaultProllyTree } from "../src/impls.js";
import { cborTreeCodec, sha256SyncHasher } from "../src/index.js";
import {
  bucketCidToDigest,
  bucketDigestToCid,
  createBucket,
  createEmptyTree,
  findFailure,
  findFailureOrLastIndex,
  loadBucket,
  prefixWithLevel,
} from "../src/utils.js";
import {
  bucket,
  bucketBytes,
  bucketCid,
  bucketHash,
  emptyBucket,
  node,
  prefix,
} from "./helpers/constants.js";

describe("utils", () => {
  describe("findFailure", () => {
    it("returns the index of the first element to fail a test", () => {
      expect(findFailure([0, 1, 2], (x) => x < 1)).to.equal(1);
      expect(findFailure([2, 1, 0], (x) => x < 1)).to.equal(0);
      expect(findFailure([2, 1, 0], (x) => x >= 1)).to.equal(2);
    });

    it("returns the length of the array if no elements fail the test", () => {
      expect(findFailure([], () => true)).to.equal(0);
      expect(findFailure([0, 1, 2], (x) => x < 3)).to.equal(3);
    });
  });

  describe("findFailure", () => {
    it("returns the index of the first element to fail a test", () => {
      expect(findFailureOrLastIndex([0, 1, 2], (x) => x < 1)).to.equal(1);
      expect(findFailureOrLastIndex([2, 1, 0], (x) => x < 1)).to.equal(0);
      expect(findFailureOrLastIndex([2, 1, 0], (x) => x >= 1)).to.equal(2);
    });

    it("returns the length of the array -1 if no elements fail the test", () => {
      expect(findFailureOrLastIndex([0, 1, 2], (x) => x < 3)).to.equal(2);
    });

    it("throws if the array has no elements", () => {
      expect(() => findFailureOrLastIndex([], () => true)).to.throw()
    });
  });

  describe("prefixWithLevel", () => {
    it("returns a new prefix with the given level", () => {
      expect(prefix.level).to.equal(0);
      expect(prefixWithLevel(prefix, 1)).to.deep.equal({ ...prefix, level: 1 });
    });
  });

  describe("bucketDigestToCid", () => {
    it("returns the cid for a given bucket hash", () => {
      expect(bucketDigestToCid(prefix)(bucketHash)).to.deep.equal(bucketCid);
    });
  });

  describe("bucketCidToDigest", () => {
    it("returns a bucket cid for the given hash", () => {
      expect(bucketCidToDigest(bucketCid)).to.deep.equal(bucketHash);
    });
  });

  describe("createBucket", () => {
    it("returns a bucket", () => {
      expect(
        createBucket(prefix, [node], cborTreeCodec, sha256SyncHasher),
      ).to.deep.equal(bucket);
    });
  });

  describe("loadBucket", () => {
    const blockstore = new MemoryBlockstore();
    blockstore.put(bucketCid, bucketBytes);

    it("returns a bucket from a blockstore for the given hash", async () => {
      expect(
        await loadBucket(
          blockstore,
          bucketHash,
          prefix,
          cborTreeCodec,
          sha256SyncHasher,
        ),
      ).to.deep.equal(bucket);
    });

    it("throws if bucket is not found in blockstore", () => {
      const blockstore = new MemoryBlockstore();
      expect(
        () =>
          loadBucket(
            blockstore,
            bucketHash,
            prefix,
            cborTreeCodec,
            sha256SyncHasher,
          ),
      ).rejects.toMatchObject(errNotFound());
    });

    it("throws if bucket level mismatches level of expected prefix", () => {
      expect(
        () =>
          loadBucket(
            blockstore,
            bucketHash,
            { ...prefix, level: 1 },
            cborTreeCodec,
            sha256SyncHasher,
          ),
      ).rejects.toMatchObject(unexpectedBucketLevel(0, 1));
    });

    it("throws if bucket hash does not match requested hash", () => {
      const blockstore = new MemoryBlockstore();
      blockstore.put(emptyBucket.getCID(), bucketBytes);
      expect(
        () =>
          loadBucket(
            blockstore,
            emptyBucket.getHash(),
            prefix,
            cborTreeCodec,
            sha256SyncHasher,
          ),
      ).rejects.toMatchObject(unexpectedBucketHash());
    });
  });

  describe("createEmptyTree", () => {
    it("returns an empty tree", () => {
      expect(
        createEmptyTree(cborTreeCodec, sha256SyncHasher, {
          averageBucketSize: 30,
        }),
      ).to.deep.equal(
        new DefaultProllyTree(
          createBucket(prefix, [], cborTreeCodec, sha256SyncHasher),
          cborTreeCodec,
          sha256SyncHasher,
        ),
      );
    });
  });
});
