import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it, vi } from "vitest";
import "../src/boundary.js";
import { DefaultEntry, DefaultProllyTree } from "../src/impls.js";
import {
  cloneTree,
  createEmptyTree,
  loadTree,
  merge,
  search,
  sync,
} from "../src/index.js";
import { createBucket } from "../src/utils.js";
import { createProllyTreeEntries } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  bytes,
  entry,
  key,
  level,
  seq,
  tree,
} from "./helpers/constants.js";
import { oddTree, oddTreeEntries } from "./helpers/odd-tree.js";

vi.mock("../src/boundary.js");

describe("index", () => {
  describe("createEmptyTree", () => {
    it("returns an empty tree", () => {
      expect(createEmptyTree()).to.deep.equal(
        new DefaultProllyTree(createBucket(average, level, [])),
      );
    });
  });

  describe("loadTree", () => {
    it("loads a tree from the blockstore", async () => {
      const blockstore = new MemoryBlockstore();
      blockstore.put(tree.root.getCID(), tree.root.getBytes());
      const loadedTree = await loadTree(blockstore, tree.root.getCID());
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
      const expected = oddTreeEntries;
      let count = 0;
      for await (const entry of search(blockstore, oddTree, oddTreeEntries)) {
        expect(entry).to.deep.equal(expected[count]);
        count++;
      }
    });

    it("yields tuples for entries not found in a tree", async () => {
      const tuple = { seq: 10, key: bytes };
      for await (const entry of search(blockstore, oddTree, [tuple])) {
        expect(entry).to.deep.equal(tuple);
      }
    });

    it("rejects if tuples is unordered or contains duplicates", async () => {
      const unorderedTuples = createProllyTreeEntries([1, 0]);
      const unorderedSearch = search(
        blockstore,
        tree,
        unorderedTuples,
      ) as AsyncGenerator;

      await unorderedSearch.next();
      expect(unorderedSearch.next()).rejects.toThrow(
        "Tuples must be ordered and non-repeating",
      );

      const repeatingTuples = createProllyTreeEntries([1, 1]);
      const repeatingSearch = search(
        blockstore,
        tree,
        repeatingTuples,
      ) as AsyncGenerator;

      await repeatingSearch.next();
      expect(repeatingSearch.next()).rejects.toThrow(
        "Tuples must be ordered and non-repeating",
      );
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
      const entry2 = new DefaultEntry(seq, key, new Uint8Array(32));
      const tree2 = new DefaultProllyTree(
        createBucket(average, level, [entry2]),
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

  describe("pull", () => {
    it("fetches missing blocks and adds them to the local blockstore", async () => {
      const localBlockstore = new MemoryBlockstore();
      const target = createEmptyTree({ average });

      expect(target).to.not.deep.equal(tree);

      for await (const cids of sync(
        localBlockstore,
        target,
        tree,
        blockstore,
      )) {
        expect(cids).to.deep.equal([tree.root.getCID()]);
      }

      expect(await localBlockstore.get(tree.root.getCID())).to.deep.equal(
        tree.root.getBytes(),
      );

      expect(target).to.deep.equal(tree);
    });
  });
});
