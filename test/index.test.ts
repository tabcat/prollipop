import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it, vi } from "vitest";
import { DefaultEntry, DefaultProllyTree } from "../src/impls.js";
import {
  cloneTree,
  createEmptyTree,
  loadTree,
  merge,
  range,
  search,
  sync,
} from "../src/index.js";
import { bucketDigestToCid, createBucket, toKey } from "../src/utils.js";
import { createProllyTreeEntries } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  entry,
  key,
  level,
  tree,
} from "./helpers/constants.js";
import { oddTree, oddTreeEntries, oddTreeState } from "./helpers/odd-tree.js";
import { createKey } from "./helpers/utils.js";

vi.mock("../src/boundary.js");

describe("index", () => {
  describe("createEmptyTree", () => {
    it("returns an empty tree", () => {
      expect(createEmptyTree()).to.deep.equal(
        new DefaultProllyTree(
          createBucket(average, level, [], { isTail: true, isHead: true }),
        ),
      );
    });
  });

  describe("loadTree", () => {
    it("loads a tree from the blockstore", async () => {
      const blockstore = new MemoryBlockstore();
      const { digest, bytes } = tree.root.getAddressed();
      blockstore.put(bucketDigestToCid(digest), bytes);
      const loadedTree = await loadTree(blockstore, bucketDigestToCid(digest));
      expect(loadedTree).to.deep.equal(tree);
    });
  });

  describe("cloneTree", () => {
    it("returns a copy of the tree", () => {
      const clone = cloneTree(tree);
      expect(clone).to.deep.equal(tree);
      expect(clone).to.not.equal(tree);
    });
  });

  describe("search", async () => {
    it("yields entries found in a tree", async () => {
      const expected = oddTreeState[1]!.map((b) => b.entries);
      let count = 0;
      for await (const entry of search(blockstore, oddTree, [oddTreeEntries])) {
        expect(entry).to.deep.equal(expected[count]);
        count++;
      }
    });

    it("yields key records for entries not found in a tree", async () => {
      const key = createKey(10);
      for await (const [entry] of search(blockstore, oddTree, [[key]])) {
        expect(entry).to.deep.equal(key);
      }
    });

    it("rejects if keys is unordered or contains duplicates", async () => {
      const unorderedkeys = createProllyTreeEntries([1, 0]);
      const unorderedSearch = search(blockstore, tree, [
        unorderedkeys,
      ]) as AsyncGenerator;

      await expect(unorderedSearch.next()).rejects.toThrow(
        "keys are unsorted or duplicate.",
      );

      const repeatingkeys = createProllyTreeEntries([1, 1]);
      const repeatingSearch = search(blockstore, tree, [
        repeatingkeys,
      ]) as AsyncGenerator;

      await expect(repeatingSearch.next()).rejects.toThrow(
        "keys are unsorted or duplicate.",
      );
    });
  });

  describe("range", async () => {
    it("yields entries from start of key range to right before end of key range", async () => {
      let count = 0;
      const results = [
        [oddTreeEntries[1]],
        [oddTreeEntries[2], oddTreeEntries[3]],
        [oddTreeEntries[4]],
      ];
      for await (const entries of range(blockstore, oddTree, [
        toKey(oddTreeEntries[1]!),
        toKey(oddTreeEntries[5]!),
      ])) {
        expect(entries).to.deep.equal(results[count]);
        count++;
      }
    });

    it("yields no entries if start === end of key range", async () => {
      for await (const _ of range(blockstore, oddTree, [
        toKey(oddTreeEntries[1]!),
        toKey(oddTreeEntries[1]!),
      ])) {
        expect.fail();
      }
    });

    it('yields all entries if start === "MIN_KEY" and end === "MAX_KEY"', async () => {
      let count = 0;
      const results = [
        [oddTreeEntries[0], oddTreeEntries[1]],
        [oddTreeEntries[2], oddTreeEntries[3]],
        [oddTreeEntries[4], oddTreeEntries[5]],
      ];
      for await (const entries of range(blockstore, oddTree, [
        "MIN_KEY",
        "MAX_KEY",
      ])) {
        expect(entries).to.deep.equal(results[count]);
        count++;
      }
    });
  });

  describe("merge", () => {
    it("merges two trees", async () => {
      const emptryTree = createEmptyTree();

      expect(emptryTree).to.not.deep.equal(tree);

      for await (const diff of merge(blockstore, emptryTree, tree)) {
        expect(diff.entries[0]).to.deep.equal([null, entry]);
        expect(diff.buckets[0]).to.deep.equal([emptryTree.root, null]);
        expect(diff.buckets[1]).to.deep.equal([null, tree.root]);
      }

      expect(emptryTree).to.deep.equal(tree);
    });

    it("accepts a choose function for handling key conflicts", async () => {
      const entry2 = new DefaultEntry(key, new Uint8Array(32));
      const tree2 = new DefaultProllyTree(
        createBucket(average, level, [entry2], { isTail: true, isHead: true }),
      );

      expect(tree).to.not.deep.equal(tree2);

      for await (const diff of merge(
        blockstore,
        tree,
        tree2,
        undefined,
        (_e1, e2) => e2,
      )) {
        expect(diff.entries[0]).to.deep.equal([entry, entry2]);
        expect(diff.buckets[0]).to.deep.equal([tree.root, null]);
        expect(diff.buckets[1]).to.deep.equal([null, tree2.root]);
      }

      expect(tree).to.deep.equal(tree2);
    });
  });

  describe("sync", () => {
    it("fetches missing blocks and adds them to the local blockstore", async () => {
      const localBlockstore = new MemoryBlockstore();
      const target = createEmptyTree({ average });

      expect(target).to.not.deep.equal(tree);

      const { digest, bytes } = tree.root.getAddressed();
      const cid = bucketDigestToCid(digest);

      for await (const cids of sync(
        localBlockstore,
        target,
        tree,
        blockstore,
      )) {
        expect(cids).to.deep.equal([cid]);
      }

      expect(await localBlockstore.get(cid)).to.deep.equal(bytes);

      expect(target).to.deep.equal(tree);
    });
  });
});
