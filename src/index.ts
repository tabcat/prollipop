import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { ensureSortedTuplesIterable, findUpperBound } from "./common.js";
import { compareTuples } from "./compare.js";
import { DEFAULT_AVERAGE } from "./constants.js";
import { createCursor } from "./cursor.js";
import { ProllyTreeDiff, diff } from "./diff.js";
import { DefaultProllyTree } from "./impls.js";
import {
  Await,
  AwaitIterable,
  Blockgetter,
  Entry,
  ProllyTree,
  Tuple,
} from "./interface.js";
import { mutate } from "./mutate.js";
import {
  bucketCidToDigest,
  bucketDigestToCid,
  createEmptyBucket,
  entryToTuple,
  getBucketBoundary,
  loadBucket,
} from "./utils.js";

export { createCursor, diff, mutate };

/**
 * Creates an empty prolly-tree.
 *
 * @param options
 * @returns
 */
export function createEmptyTree(options?: { average: number }): ProllyTree {
  return new DefaultProllyTree(
    createEmptyBucket(options?.average ?? DEFAULT_AVERAGE),
  );
}

/**
 * Loads a prolly-tree from the provided blockstore.
 *
 * @param blockstore
 * @param cid
 * @returns
 */
export async function loadTree(
  blockstore: Blockgetter,
  cid: CID,
): Promise<ProllyTree> {
  return new DefaultProllyTree(
    await loadBucket(blockstore, bucketCidToDigest(cid), {
      isTail: true,
      isHead: true,
    }),
  );
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
  // only care about tree.root property mutations, Buckets and Entries of a tree should never be mutated
  return new DefaultProllyTree(tree.root);
}

/**
 * Search the tree for entries.
 *
 * @param blockstore - blockstore to use to fetch buckets
 * @param tree - ProllyTree to search
 * @param tuples - Tuple used to search for associated value
 *
 * @returns Associated Entry if found, otherwise returns Tuple
 */
export async function* search(
  blockstore: Blockgetter,
  tree: ProllyTree,
  tuples: AwaitIterable<Tuple[]>,
): AsyncIterable<(Entry | Tuple)[]> {
  const cursor = createCursor(blockstore, tree);
  let results: (Entry | Tuple)[] = [];

  for await (let t of ensureSortedTuplesIterable(tuples)) {
    if (cursor.done()) {
      yield t.map(entryToTuple);
      continue;
    }

    // do this without copying in the future
    t = t.slice();

    while (t.length > 0) {
      await cursor.nextTuple(t[0]!, 0);

      const currentBucket = cursor.currentBucket();
      const tuples = t.splice(
        0,
        cursor.isAtHead()
          ? t.length
          : findUpperBound(t, getBucketBoundary(currentBucket)!, compareTuples),
      );

      for (const [tuple, entry] of pairwiseTraversal(
        tuples,
        currentBucket.entries,
        compareTuples,
      )) {
        if (tuple == null) {
          continue;
        } else {
          if (entry == null) {
            results.push(entryToTuple(tuple));
          } else {
            results.push(entry);
          }
        }
      }

      if (results.length > 0) {
        yield results;
        results = [];
      }
    }
  }
}

/**
 * Merge a source prolly-tree into target.
 * If a key does not exist in target then it is added from source into target.
 * If both trees have an entry at the same tuple and a `choose` function was provided,
 * then the entry from the source tree may also be added to target.
 *
 * @param blockstore - target blockstore
 * @param target - Prolly-tree to merge source into
 * @param source - Prolly-tree to merge into target
 * @param remoteBlockstore - source blockstore
 * @param choose - Chooses between two entries. Must return one of the provided entry instances.
 */
export async function* merge(
  blockstore: Blockgetter,
  target: ProllyTree,
  source: ProllyTree,
  remoteBlockstore?: Blockgetter,
  choose?: (a: Entry, b: Entry) => Entry,
): AsyncIterable<ProllyTreeDiff> {
  if (target.root.average !== source.root.average) {
    throw new Error("Provided trees are not compatible.");
  }

  remoteBlockstore = remoteBlockstore ?? blockstore;

  async function* getDifferentEntries() {
    for await (const { entries } of diff(
      blockstore,
      target,
      source,
      remoteBlockstore,
    )) {
      const add: Entry[] = [];
      for (const [t, s] of entries) {
        if (t == null) {
          add.push(s);
        }

        if (t != null && s != null) {
          typeof choose === "function" && choose(t, s) === s && add.push(s);
        }
      }

      if (add.length > 0) {
        yield add;
      }
    }
  }

  yield* mutate(blockstore, target, getDifferentEntries());
}

/**
 * Syncs the target with the source.
 * Any changes in target but not in source will be removed.
 * Any changes in source but not in target will be added.
 * Under the hood it uses the `diff` function to fetch all the remote buckets.
 *
 * @param blockstore
 * @param target
 * @param source
 * @param remoteBlockstore
 * @returns
 */
export async function* sync(
  blockstore: Blockstore,
  target: ProllyTree,
  source: ProllyTree,
  remoteBlockstore?: Blockstore,
): AsyncIterable<CID[]> {
  remoteBlockstore = remoteBlockstore ?? blockstore;

  for await (const { buckets } of diff(
    blockstore,
    target,
    source,
    remoteBlockstore,
  )) {
    const promises: Await<CID>[] = [];

    for (const [_, s] of buckets) {
      if (s != null) {
        const cid = bucketDigestToCid(s.getAddressed().digest);
        if (!blockstore.has(cid)) {
          promises.push(blockstore.put(cid, s.getAddressed().bytes));
        }
      }
    }

    if (promises.length > 0) {
      yield await Promise.all(promises);
    }
  }

  target.root = source.root;
}
