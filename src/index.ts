import { Blockstore } from "interface-blockstore";
import { compareTuples } from "./compare.js";
import { createCursor } from "./cursor.js";
import { DefaultProllyTree } from "./impls.js";
import { Node, ProllyTree, Tuple } from "./interface.js";
import { AwaitIterable, createBucket, nodeToTuple } from "./utils.js";

export { mutate } from "./mutate.js";

export function createEmptyTree(options?: { average: number }): ProllyTree {
  const average = options?.average ?? 32;

  return new DefaultProllyTree(createBucket(average, 0, []));
}

export function cloneTree(tree: ProllyTree): ProllyTree {
  // only care about tree.root property mutations, Buckets and Nodes of a tree should never be mutated
  return new DefaultProllyTree(tree.root);
}

/**
 *
 * @param blockstore - blockstore to use to fetch buckets
 * @param tree - ProllyTree to search
 * @param tuples - Tuple used to search for associated value
 *
 * @returns Associated Node if found, otherwise returns Tuple
 */
export async function* search(
  blockstore: Blockstore,
  tree: ProllyTree,
  tuples: AwaitIterable<Tuple>,
): AsyncIterable<Node | Tuple> {
  const cursor = createCursor(blockstore, tree);

  let lastTuple: Tuple | null = null;
  for await (const tuple of tuples) {
    if (lastTuple != null && compareTuples(tuple, lastTuple) <= 0) {
      throw new Error("Tuples must be ordered and non-repeating");
    }
    lastTuple = tuple;

    if (cursor.done()) {
      yield nodeToTuple(tuple);
      continue;
    }

    await cursor.nextTuple(tuple, 0);

    if (compareTuples(tuple, cursor.current()) === 0) {
      yield cursor.current();
    } else {
      yield nodeToTuple(tuple);
    }
  }
}
