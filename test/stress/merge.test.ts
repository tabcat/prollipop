import { union } from "@tabcat/sorted-sets/union";
import { describe, expect, it } from "vitest";
import { ensureSortedKeysIterable } from "../../src/common.js";
import { compareBytes } from "../../src/compare.js";
import {
  createCursor,
  getCurrentBucket,
  nextBucket,
} from "../../src/cursor/index.js";
import { cloneTree, merge } from "../../src/index.js";
import { Entry } from "../../src/interface.js";
import { bucketDigestToCid, toKey } from "../../src/utils.js";
import { blockstore } from "../helpers/constants.js";
import { trees } from "./trees.js";

const checkMerge = async (
  tree1Name: string,
  tree2Name: string,
): Promise<void> => {
  const states1 = trees.get(tree1Name)!;
  const states2 = trees.get(tree2Name)!;

  const tree1 = states1.tree;
  const tree2 = states2.tree;
  const clone1 = cloneTree(tree1);

  for await (const diff of merge(blockstore, clone1, tree2)) {
    for (const [_, added] of diff.buckets) {
      if (added) {
        const { digest, bytes } = added.getAddressed();
        blockstore.put(bucketDigestToCid(digest), bytes);
      }
    }
  }

  for await (const _ of ensureSortedKeysIterable([states1.entries])) {
  }
  for await (const _ of ensureSortedKeysIterable([states2.entries])) {
  }

  const cursor = createCursor(blockstore, clone1);
  await nextBucket(cursor, 0);

  const result: Entry[] = [];
  while (!cursor.isDone) {
    result.push(...getCurrentBucket(cursor).entries);
    try {
      await nextBucket(cursor);
    } catch (e) {
      throw e;
    }
  }

  let expectedResult: Entry[] = [
    ...union(states1.entries, states2.entries, (a: Entry, b: Entry) =>
      compareBytes(toKey(a), toKey(b)),
    ),
  ];

  expect(result).to.deep.equal(expectedResult);
};

describe("merge", () => {
  for (const tree1Name of trees.keys()) {
    for (const tree2Name of trees.keys()) {
      it(`yields merge of ${tree1Name} and ${tree2Name} trees`, async () => {
        try {
          await checkMerge(tree1Name, tree2Name);
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
