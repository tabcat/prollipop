import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { describe, expect, it } from "vitest";
import { compareTuples } from "../src/compare.js";
import { DefaultProllyTree } from "../src/impls.js";
import { cloneTree, createEmptyTree, search } from "../src/index.js";
import { Node, ProllyTree, Tuple } from "../src/interface.js";
import { createBucket, nodeToTuple } from "../src/utils.js";
import {
  average,
  blockstore,
  level,
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
  });
});
