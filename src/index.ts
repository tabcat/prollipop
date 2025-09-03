import { pairwiseTraversal } from "@tabcat/sorted-sets/util";
import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { ensureSortedKeysIterable, findUpperBound } from "./common.js";
import { compareBytes, compareKeys } from "./compare.js";
import { DEFAULT_AVERAGE } from "./constants.js";
import {
  createCursor,
  getCurrentBucket,
  getCurrentEntry,
  nextBucket,
  skipToKey,
} from "./cursor/index.js";
import { ProllyTreeDiff, diff } from "./diff.js";
import { DefaultProllyTree } from "./impls.js";
import {
  Await,
  AwaitIterable,
  Blockfetcher,
  Bucket,
  Entry,
  KeyLike,
  KeyRange,
  ProllyTree,
} from "./interface.js";
import { mutate } from "./mutate.js";
import {
  bucketCidToDigest,
  bucketDigestToCid,
  createEmptyBucket,
  getBucketBoundary,
  loadBucket,
  toKey,
} from "./utils.js";

export { diff, mutate };

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
  blockstore: Blockfetcher,
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
 * @param keys - Keys used to search for associated value
 *
 * @returns Associated Entry if found, otherwise returns a key.
 */
export async function* search(
  blockstore: Blockfetcher,
  tree: ProllyTree,
  keys: AwaitIterable<KeyLike[]>,
): AsyncIterable<KeyLike[]> {
  const cursor = createCursor(blockstore, tree);
  let results: KeyLike[] = [];

  for await (let k of ensureSortedKeysIterable(keys)) {
    if (cursor.isDone) {
      yield k.map(toKey);
      continue;
    }

    // do this without copying in the future
    k = k.slice();

    while (k.length > 0) {
      await skipToKey(cursor, toKey(k[0]!), 0);

      const currentBucket = getCurrentBucket(cursor);
      const keySplice = k.splice(
        0,
        currentBucket.getContext().isHead
          ? k.length
          : findUpperBound(k, getBucketBoundary(currentBucket)!, (a, b) =>
              compareBytes(toKey(a), b.key),
            ),
      );

      for (const [keyRecord, entry] of pairwiseTraversal(
        keySplice,
        currentBucket.entries,
        (a, b) => compareBytes(toKey(a), b.key),
      )) {
        if (keyRecord == null) {
          continue;
        } else {
          if (entry == null) {
            results.push(toKey(keyRecord));
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
 * Read a range of entries from the tree.
 *
 * @param blockstore
 * @param tree
 * @param range - start (inclusive) and end (exclusive) of key range to read.
 */
export async function* range(
  blockstore: Blockstore,
  tree: ProllyTree,
  range: KeyRange,
): AsyncIterable<Entry[]> {
  const cursor = createCursor(blockstore, tree);
  await skipToKey(cursor, range[0], 0);

  let bucket: Bucket;
  while (
    !cursor.isDone &&
    (bucket = getCurrentBucket(cursor)) &&
    compareKeys(toKey(bucket.entries[0]!), range[1]) < 0
  ) {
    const entries: Entry[] = [];

    let entry: Entry;
    while (
      bucket.entries.length > cursor.currentIndex &&
      (entry = getCurrentEntry(cursor)) &&
      compareKeys(toKey(entry), range[1]) < 0
    ) {
      entries.push(entry);
      cursor.currentIndex++;
    }

    if (entries.length) yield entries;
    await nextBucket(cursor);
  }
}

/**
 * Merge a source prolly-tree into target.
 * If a key does not exist in target then it is added from source into target.
 * If both trees have an entry at the same key and a `choose` function was provided,
 * then the entry from the source tree may also be added to target.
 *
 * @param blockstore - target blockstore
 * @param target - Prolly-tree to merge source into
 * @param source - Prolly-tree to merge into target
 * @param remoteBlockstore - source blockstore
 * @param choose - Chooses between two entries. Must return one of the provided entry instances.
 */
export async function* merge(
  blockstore: Blockfetcher,
  target: ProllyTree,
  source: ProllyTree,
  remoteBlockstore?: Blockfetcher,
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
