import { Blockstore } from "interface-blockstore";
import { compareTuples } from "./compare.js";
import { createCursor } from "./cursor.js";
import { DefaultProllyTree } from "./impls.js";
import { Node, ProllyTree, Tuple } from "./interface.js";
import { createBucket, nodeToTuple } from "./utils.js";

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
  tuples: Tuple[],
): AsyncIterable<Node | Tuple> {
  tuples = tuples.slice().sort(compareTuples).map(nodeToTuple);

  const cursor = createCursor(blockstore, tree);

  while (tuples.length > 0) {
    // remove first tuple from tuples
    const [tuple] = tuples.splice(0, 1) as [Tuple];

    if (cursor.done()) {
      yield tuple;
      continue;
    }

    await cursor.nextTuple(tuple, 0);

    const node: Node = cursor.current();

    if (compareTuples(tuple, node) === 0) {
      yield node;
    } else {
      yield tuple;
    }
  }
}
