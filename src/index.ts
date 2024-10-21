import { Blockstore } from "interface-blockstore";
import { asyncMap } from "iter-tools-es";
import { compareTuples } from "./compare.js";
import { createCursor } from "./cursor.js";
import { ProllyTreeDiff, diff } from "./diff.js";
import { DefaultProllyTree } from "./impls.js";
import { Node, ProllyTree, Tuple } from "./interface.js";
import { mutate } from "./mutate.js";
import { AwaitIterable, createBucket, nodeToTuple } from "./utils.js";

export { mutate };

/**
 * Creates an empty prolly-tree.
 *
 * @param options
 * @returns
 */
export function createEmptyTree(options?: { average: number }): ProllyTree {
  const average = options?.average ?? 32;

  return new DefaultProllyTree(createBucket(average, 0, []));
}

/**
 * Clones a prolly-tree.
 * The `mutate` function will mutate the given prolly-tree, assuming no errors are thrown.
 * This function can be used to keep old versions of a tree after it has been mutated.
 *
 * @param tree
 * @returns
 */
export function cloneTree(tree: ProllyTree): ProllyTree {
  // only care about tree.root property mutations, Buckets and Nodes of a tree should never be mutated
  return new DefaultProllyTree(tree.root);
}

/**
 * Search the tree for nodes.
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

/**
 * Merge a source prolly-tree into target. If a key does not exist in target then it is added from source into target.
 * If both trees have a node at the same tuple and a `choose` function was provided, then the node from the source tree may also be added to target.
 *
 * @param blockstore - target blockstore
 * @param target - Prolly-tree to merge source into
 * @param source - Prolly-tree to merge into target
 * @param remoteBlockstore - source blockstore
 * @param choose - Chooses between two nodes. Must return one of the provided node instances.
 */
export async function* merge(
  blockstore: Blockstore,
  target: ProllyTree,
  source: ProllyTree,
  remoteBlockstore?: Blockstore,
  choose?: (a: Node, b: Node) => Node,
): AsyncIterable<ProllyTreeDiff> {
  remoteBlockstore = remoteBlockstore ?? blockstore;

  const getNewNodes = ({ nodes }: ProllyTreeDiff) => {
    const add: Node[] = [];
    for (const [t, s] of nodes) {
      if (t == null) {
        add.push(s);
      }

      if (t != null && s != null) {
        typeof choose === "function" && choose(t, s) === s && add.push(s);
      }
    }
    return add;
  };

  yield* mutate(
    blockstore,
    target,
    asyncMap(getNewNodes, diff(blockstore, target, source, remoteBlockstore)),
  );
}
