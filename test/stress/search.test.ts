import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { describe, expect, it } from "vitest";
import { compareBytes } from "../../src/compare.js";
import { search } from "../../src/index.js";
import { KeyLike } from "../../src/interface.js";
import { toKey } from "../../src/utils.js";
import { blockstore } from "../helpers/constants.js";
import { trees } from "./trees.js";

const checkSearch = async (
  tree1Name: string,
  tree2Name: string,
): Promise<void> => {
  const states1 = trees.get(tree1Name)!;
  const states2 = trees.get(tree2Name)!;

  const tree1 = states1.tree;

  const result: KeyLike[] = [];

  for await (const entry of search(blockstore, tree1, [states2.entries])) {
    result.push(...entry);
  }

  let expectedResult: KeyLike[] = [];
  for (const [entry1, entry2] of pairwiseTraversal(
    states1.entries,
    states2.entries,
    (a, b) => compareBytes(a.key, b.key),
  )) {
    if (entry2 != null) {
      if (entry1 != null) {
        expectedResult.push(entry1);
      } else {
        expectedResult.push(toKey(entry2));
      }
    }
  }

  expect(result).to.deep.equal(expectedResult);
};

describe("search", () => {
  for (const tree1Name of trees.keys()) {
    for (const tree2Name of trees.keys()) {
      it(`yields search of ${tree1Name} and ${tree2Name} trees`, async () => {
        try {
          await checkSearch(tree1Name, tree2Name);
        } catch (e) {
          console.error("Failed search on trees: ", tree1Name, tree2Name);
          if (tree1Name.includes("randomized")) {
            console.log(trees.get(tree1Name)?.ids.toString());
          }
          if (tree2Name.includes("randomized")) {
            console.log(trees.get(tree2Name)?.ids.toString());
          }
          throw e;
        }
      });
    }
  }
});
