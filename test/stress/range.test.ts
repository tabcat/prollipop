import { describe, expect, it } from "vitest";
import { compareKeys } from "../../src/compare.js";
import { range } from "../../src/index.js";
import { Entry } from "../../src/interface.js";
import { getEntryRange, toKey } from "../../src/utils.js";
import { blockstore } from "../helpers/constants.js";
import { trees } from "./trees.js";

const checkRange = async (
  tree1Name: string,
  tree2Name: string,
): Promise<void> => {
  const states1 = trees.get(tree1Name)!;
  const states2 = trees.get(tree2Name)!;

  const tree1 = states1.tree;
  const tree2 = states2.tree;

  const result: Entry[] = [];

  const entryRange = getEntryRange(tree2.root.entries);

  for await (const entries of range(blockstore, tree1, entryRange)) {
    result.push(...entries);
  }

  let expectedResult: Entry[] = states1.entries.filter(
    (e) =>
      compareKeys(toKey(e), entryRange[0]) >= 0 &&
      compareKeys(toKey(e), entryRange[1]) < 0,
  );

  expect(result).to.deep.equal(expectedResult);
};

describe("range", () => {
  for (const tree1Name of trees.keys()) {
    for (const tree2Name of trees.keys()) {
      it(`yields range of ${tree1Name} using key range from ${tree2Name} root`, async () => {
        try {
          await checkRange(tree1Name, tree2Name);
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
