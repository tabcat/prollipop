import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it } from "vitest";
import { compareTuples } from "../src/compare.js";
import { DefaultProllyTree } from "../src/impls.js";
import {
  cloneTree,
  createEmptyTree,
  merge,
  search,
  sync,
} from "../src/index.js";
import { Node, ProllyTree, Tuple } from "../src/interface.js";
import { createBucket, nodeToTuple } from "../src/utils.js";
import { createProllyTreeNodes } from "./helpers/build-tree.js";
import {
  average,
  blockstore,
  hash,
  level,
  node,
  timestamp,
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

    const result: (Node | Tuple)[] = [];

    for await (const node of search(blockstore, tree1, states2.nodes)) {
      result.push(node);
    }

    let expectedResult: (Node | Tuple)[] = [];
    for (const [node1, node2] of pairwiseTraversal(
      states1.nodes,
      states2.nodes,
      compareTuples,
    )) {
      if (node2 != null) {
        if (node1 != null) {
          expectedResult.push(node1);
        } else {
          expectedResult.push(nodeToTuple(node2));
        }
      }
    }

    expect(result).to.deep.equal(expectedResult);
  };

  describe("search", async () => {
    it("yields nodes for found and tuples for missing", async () => {
      for (const tree1 of trees) {
        for (const tree2 of trees) {
          await checkSearch(tree1, tree2);
        }
      }
    });

    it("rejects if tuples is unordered or contains duplicates", async () => {
      const unorderedTuples = createProllyTreeNodes([1, 0]);
      const unorderedSearch = search(
        blockstore,
        tree,
        unorderedTuples,
      ) as AsyncGenerator;

      await unorderedSearch.next();
      expect(unorderedSearch.next()).rejects.toThrow(
        "Tuples must be ordered and non-repeating",
      );

      const repeatingTuples = createProllyTreeNodes([1, 1]);
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
        expect(diff.nodes[0]).to.deep.equal([null, node]);
        expect(diff.buckets[0]).to.deep.equal([emptryTree.root, null]);
        expect(diff.buckets[1]).to.deep.equal([null, tree.root]);
      }

      expect(emptryTree).to.deep.equal(tree);
    });

    it("accepts a choose function for handling key conflicts", async () => {
      const node2 = { timestamp, hash, message: new Uint8Array(32) };
      const tree2 = new DefaultProllyTree(
        createBucket(average, level, [node2]),
      );

      expect(tree).to.not.deep.equal(tree2);

      for await (const diff of merge(
        blockstore,
        tree,
        tree2,
        undefined,
        (_node1, node2) => node2,
      )) {
        expect(diff.nodes[0]).to.deep.equal([node, node2]);
        expect(diff.buckets[0]).to.deep.equal([null, tree2.root]);
        expect(diff.buckets[1]).to.deep.equal([tree.root, null]);
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
