import { pairwiseTraversal } from "@tabcat/ordered-sets/util";
import { Blockstore } from "interface-blockstore";
import { builder, Update } from "./builder.js";
import { compareTuples } from "./compare.js";
import { createCursor } from "./cursor.js";
import { ProllyTreeDiff } from "./diff.js";
import { DefaultProllyTree } from "./impls.js";
import { Node, ProllyTree, Tuple } from "./interface.js";
import { createBucket, nodeToTuple } from "./utils.js";

export function createEmptyTree(options?: { average: number }) {
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
 * @param tuple - Tuple used to search for associated value
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

export async function* mutate(
  blockstore: Blockstore,
  tree: ProllyTree,
  add: Node[],
  rm: Tuple[],
): AsyncIterable<ProllyTreeDiff> {
  const updates: Update[] = [];

  // it is critical that add and rm are ordered and do not have duplicate tuples within themselves
  for (const [a, r] of pairwiseTraversal(add, rm, compareTuples)) {
    // prioritizes adds over removes
    if (a != null) {
      updates.push({ op: "add", value: a });
    } else {
      updates.push({ op: "rm", value: r });
    }
  }

  // should think about further checking user input for duplicate tuples

  const mutation = builder(blockstore, tree, updates);

  const promises: Promise<unknown>[] = [];
  for await (const diff of mutation) {
    yield diff;

    // save new buckets to blockstore
    // helper code to make easier to use for now, probably will be removed or changed
    for (const [_, bucket] of diff.buckets) {
      if (bucket == null) continue;

      promises.push(
        Promise.resolve(blockstore.put(bucket.getCID(), bucket.getBytes())),
      );
    }
  }

  await Promise.all(promises);
}
