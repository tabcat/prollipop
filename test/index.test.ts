import { difference } from "@tabcat/ordered-sets/difference";
import { intersection } from "@tabcat/ordered-sets/intersection";
import { describe, expect, it } from "vitest";
import { compareBucketHashes, compareTuples } from "../src/compare.js";
import { NodeDiff, diff } from "../src/diff.js";
import { DefaultProllyTree } from "../src/impls.js";
import { cloneTree, createEmptyTree, mutate, search } from "../src/index.js";
import { Bucket, Node, ProllyTree, Tuple } from "../src/interface.js";
import { createBucket, nodeToTuple } from "../src/utils.js";
import {
  emptyTree,
  randomTree,
  subTree,
  superTree,
  treesToStates,
} from "./helpers/check-diffs.js";
import { Mc, Mh, blockstore, prefix, tree } from "./helpers/constants.js";

describe("index", () => {
  describe("createEmptyTree", () => {
    it("returns an empty tree", () => {
      expect(createEmptyTree()).to.deep.equal(
        new DefaultProllyTree(createBucket(prefix, [])),
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

  describe("search", () => {
    const checkSearch = async (
      tree1: ProllyTree<Mc, Mh>,
      tree2: ProllyTree<Mc, Mh>,
    ): Promise<void> => {
      const states1 = treesToStates.get(tree1)!;
      const states2 = treesToStates.get(tree2)!;

      const result: (Node | Tuple)[] = [];

      for await (const node of search(blockstore, tree1, states2.nodes)) {
        result.push(node);
      }

      const matchedNodes = Array.from(
        intersection(states2.nodes, states1.nodes, compareTuples),
      );
      const unmatchedNodes = Array.from(
        difference(states2.nodes, matchedNodes, compareTuples),
      ).map(nodeToTuple);

      const expectedResult = [...matchedNodes, ...unmatchedNodes].sort(
        compareTuples,
      );

      expect(result).to.deep.equal(expectedResult);
    };

    it("yields nodes if and tuples for tuples if found or not found, respectively", async () => {
      await checkSearch(emptyTree, emptyTree);
      await checkSearch(emptyTree, superTree);
      await checkSearch(superTree, superTree);
      await checkSearch(superTree, subTree);
    });
  });

  describe("mutate", () => {
    const checkMutate = async (
      tree1: ProllyTree<Mc, Mh>,
      tree2: ProllyTree<Mc, Mh>,
    ): Promise<void> => {
      const rm: Node[] = treesToStates.get(tree1)!.nodes;
      const add: Node[] = treesToStates.get(tree2)!.nodes;

      const clone1 = cloneTree(tree1);

      const actualNodes: NodeDiff[] = [];
      const actualRemovals: Bucket<Mc, Mh>[] = [];
      const actualAdditions: Bucket<Mc, Mh>[] = [];
      for await (const { nodes, buckets } of mutate(
        blockstore,
        clone1,
        add,
        rm,
      )) {
        actualNodes.push(...nodes);
        buckets.forEach(([a, b]) =>
          a != null ? actualRemovals.push(a) : actualAdditions.push(b),
        );
      }

      actualRemovals.sort(compareBucketHashes);
      actualAdditions.sort(compareBucketHashes);

      expect(clone1).to.deep.equal(tree2);

      const expectedNodes: NodeDiff[] = [];
      const expectedRemovals: Bucket<Mc, Mh>[] = [];
      const expectedAdditions: Bucket<Mc, Mh>[] = [];
      for await (const { nodes, buckets } of diff(blockstore, tree1, tree2)) {
        expectedNodes.push(...nodes);
        buckets.forEach(([a, b]) =>
          a != null ? expectedRemovals.push(a) : expectedAdditions.push(b),
        );
      }

      expectedRemovals.sort(compareBucketHashes);
      expectedAdditions.sort(compareBucketHashes);

      expect(actualNodes).to.deep.equal(expectedNodes);
      expect(actualRemovals).to.deep.equal(expectedRemovals);
      expect(actualAdditions).to.deep.equal(expectedAdditions);
    };

    it("allows nodes to be added and removed from the tree, yields a diff of the changes made", async () => {
      await checkMutate(emptyTree, emptyTree);
      await checkMutate(emptyTree, superTree);
      await checkMutate(emptyTree, subTree);
      await checkMutate(emptyTree, randomTree);
      await checkMutate(superTree, superTree);
      await checkMutate(superTree, subTree);
      await checkMutate(superTree, emptyTree);
      await checkMutate(superTree, randomTree);
      await checkMutate(subTree, subTree);
      await checkMutate(subTree, emptyTree);
      await checkMutate(subTree, superTree);
      await checkMutate(subTree, randomTree);
      await checkMutate(randomTree, randomTree);
      await checkMutate(randomTree, emptyTree);
      await checkMutate(randomTree, superTree);
      await checkMutate(randomTree, subTree);
    });
  });
});
