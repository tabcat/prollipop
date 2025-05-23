import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it, vi } from "vitest";
import "../src/boundary.js";
import { MAX_TUPLE, MIN_TUPLE } from "../src/constants.js";
import { DefaultEntry } from "../src/impls.js";
import {
  bucketCidToDigest,
  bucketDigestToCid,
  bucketToPrefix,
  createBucket,
  createEmptyBucket,
  doRangesIntersect,
  entryToTuple,
  getBucketBoundary,
  getBucketEntry,
  getEntryRange,
  loadBucket,
} from "../src/utils.js";
import {
  average,
  blockstore,
  bucket,
  cid,
  createEntry,
  createTuple,
  emptyBucket,
  entry,
  level,
  prefix,
  tuple,
} from "./helpers/constants.js";
import { oddTree, oddTreeState } from "./helpers/odd-tree.js";

vi.mock("../src/boundary.js");

describe("utils", () => {
  describe("bucketDigestToCid", () => {
    it("returns the cid for a given bucket hash", () => {
      const { digest } = bucket.getAddressed();
      expect(bucketDigestToCid(digest)).to.deep.equal(cid);
    });
  });

  describe("bucketCidToDigest", () => {
    it("returns the digest for a given bucket cid", () => {
      const { digest } = bucket.getAddressed();
      expect(bucketCidToDigest(cid)).to.deep.equal(digest);
    });
  });

  describe("getBucketBoundary", () => {
    it("returns the boundary for a given bucket", () => {
      expect(getBucketBoundary(bucket)).to.deep.equal(entry);
    });

    it("returns null if the bucket has no entries", () => {
      expect(getBucketBoundary(emptyBucket)).to.be.null;
    });
  });

  describe("getBucketEntry", () => {
    it("returns the entry for a given bucket", () => {
      expect(getBucketEntry(bucket)).to.deep.equal(
        new DefaultEntry(entry.seq, entry.key, bucket.getAddressed().digest),
      );
    });

    it("returns null if the bucket has no entries", () => {
      expect(getBucketEntry(emptyBucket)).to.be.null;
    });
  });

  describe("getEntryRange", () => {
    it("returns a range for a given entry", () => {
      expect(getEntryRange([entry])).to.deep.equal([tuple, tuple]);
    });

    it("returns a range for given entries", () => {
      expect(getEntryRange([createEntry(1), createEntry(3)])).to.deep.equal([
        createTuple(1),
        createTuple(3),
      ]);
    });

    it("returns min and max tuple if entries are empty", () => {
      expect(getEntryRange([])).to.deep.equal([MIN_TUPLE, MAX_TUPLE]);
    });
  });

  describe("hasIntersect", () => {
    it("returns true if the ranges intersect", () => {
      expect(
        doRangesIntersect(
          [tuple, createTuple(3)],
          [createTuple(1), createTuple(2)],
        ),
      ).to.equal(true);
      expect(
        doRangesIntersect(
          [tuple, createTuple(1)],
          [createTuple(1), createTuple(2)],
        ),
      ).to.equal(true);
      expect(doRangesIntersect([tuple, tuple], [tuple, tuple])).to.equal(true);
    });

    it("returns false if ranges do not intersect", () => {
      expect(
        doRangesIntersect(
          [tuple, createTuple(3)],
          [createTuple(4), createTuple(5)],
        ),
      ).to.equal(false);
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
      expect(
        createBucket(average, level, [entry], {
          isTail: true,
          isHead: true,
        }),
      ).to.deep.equal(bucket);
    });
  });

  describe("createEmptyBucket", () => {
    it("returns an empty bucket", () => {
      expect(createEmptyBucket(average)).to.deep.equal(emptyBucket);
    });
  });

  describe("loadBucket", () => {
    it("returns a root bucket from a blockstore for the given hash", async () => {
      const { digest } = oddTree.root.getAddressed();
      expect(
        await loadBucket(blockstore, digest, {
          isTail: true,
          isHead: true,
        }),
      ).to.deep.equal(oddTree.root);
    });

    it("returns a head bucket from a blockstore", async () => {
      expect(
        await loadBucket(blockstore, oddTree.root.entries[2]!.val, {
          isTail: false,
          isHead: true,
        }),
      ).to.deep.equal(oddTreeState[1]![2]);
    });

    it("throws if bucket is not found in blockstore", () => {
      const blockstore = new MemoryBlockstore();
      expect(() =>
        loadBucket(blockstore, bucket.getAddressed().digest, {
          isTail: true,
          isHead: true,
        }),
      ).rejects.toThrow("Bucket not found in blockstore.");
    });
  });
});
