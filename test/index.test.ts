import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it } from "vitest";
import { compareTuples } from "../src/compare.js";
import { DefaultEntry, DefaultProllyTree } from "../src/impls.js";
import {
  cloneTree,
  createEmptyTree,
  merge,
  search,
  sync,
} from "../src/index.js";
import { Entry, ProllyTree, Tuple } from "../src/interface.js";
import { createBucket, entryToTuple } from "../src/utils.js";
import { createProllyTreeEntries } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  entry,
  key,
  level,
  seq,
  tree,
  trees,
  treesToStates,
} from "./helpers/constants.js";

describe("index", () => {
  describe("createEmptyTree", () => {
    it("returns an empty tree", () => {
      expect(createEmptyTree()).to.deep.equal(
        new DefaultProllyTree(createBucket(average, level, [])),
      );
    });
  });

  describe("cloneTree", () => {
    it("returns a copy of the tree", () => {
      const clone = cloneTree(tree);
      expect(clone).to.deep.equal(tree);
      expect(clone).to.not.equal(tree);
    });
  });

  const checkSearch = async (
    tree1: ProllyTree,
    tree2: ProllyTree,
  ): Promise<void> => {
    const states1 = treesToStates.get(tree1)!;
    const states2 = treesToStates.get(tree2)!;

    const result: (Entry | Tuple)[] = [];

    for await (const entry of search(blockstore, tree1, states2.entries)) {
      result.push(entry);
    }

    let expectedResult: (Entry | Tuple)[] = [];
    for (const [entry1, entry2] of pairwiseTraversal(
      states1.entries,
      states2.entries,
      compareTuples,
    )) {
      if (entry2 != null) {
        if (entry1 != null) {
          expectedResult.push(entry1);
        } else {
          expectedResult.push(entryToTuple(entry2));
        }
      }
    }

    expect(result).to.deep.equal(expectedResult);
  };

  describe("search", async () => {
    it("yields entries for found and tuples for missing", async () => {
      for (const tree1 of trees) {
        for (const tree2 of trees) {
          await checkSearch(tree1, tree2);
        }
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
