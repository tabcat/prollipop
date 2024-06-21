import { Blockstore } from "interface-blockstore";
import { ProllyTree } from "./tree";
import { Tuple, Node, compareTuples } from "./node";
import {
  createCursorState,
  moveToTupleOnLevel,
  nodeOf,
} from "./cursor";
import { ProllyTreeDiff } from "./diff";
import { Update, mutateTree } from "./builder";

/**
 *
 * @param blockstore - blockstore to use to fetch buckets
 * @param tree - ProllyTree to search
 * @param tuple - Tuple used to search for associated value
 *
 * @returns Associated Node if found, otherwise returns Tuple
 */
export async function * search<T, Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  tuples: Tuple[]
): AsyncIterable<Node | Tuple> {
  tuples.sort(compareTuples)

  const cursorState = createCursorState(blockstore, tree.codec, tree.hasher, [tree.root])

  while (tuples.length > 0) {
    // remove first tuple from tuples
    const [tuple]: Tuple[] = tuples.splice(0, 1)

    await moveToTupleOnLevel(cursorState, tuple, 0)

    const node: Node = nodeOf(cursorState)

    if (compareTuples(tuple, node) === 0) {
      yield node
    } else {
      yield tuple
    }
  }
}

export async function * insert <T, Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  nodes: Node[],
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  return mutateTree(blockstore, tree, nodes.map((n): Update => [n, 'add']))
}

export async function * remove <T, Code extends number, Alg extends number>(
  blockstore: Blockstore,
  tree: ProllyTree<Code, Alg>,
  tuples: Tuple[]
): AsyncIterable<ProllyTreeDiff<Code, Alg>> {
  return mutateTree(blockstore, tree, tuples.map((t): Update => [t, 'rm']))
}
