import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { createIsBoundary } from "../../src/boundary.js";
import { encodeBucket } from "../../src/codec.js";
import { DefaultCommittedBucket, DefaultEntry } from "../../src/impls.js";
import type { CommittedBucket, Entry } from "../../src/interface.js";
import { bucketDigestToCid, getBucketEntry } from "../../src/utils.js";

const levelOfBuckets = (
  average: number,
  level: number,
  _entries: Entry[],
): CommittedBucket[] => {
  const isBoundary = createIsBoundary(average, level);
  let entries: Entry[] = [];
  const bucketEntries: Entry[][] = [];

  for (const entry of _entries) {
    entries.push(entry);

    if (isBoundary(entry)) {
      bucketEntries.push(entries);
      entries = [];
    }
  }

  if (entries.length > 0) {
    bucketEntries.push(entries);
  }

  const isNewRoot = bucketEntries.length === 1;

  const buckets: CommittedBucket[] = new Array(bucketEntries.length);
  for (const [i, entries] of bucketEntries.entries()) {
    const last = i === bucketEntries.length - 1;
    const context = {
      isTail: last && isNewRoot,
      isHead: last,
    };
    buckets[i] = new DefaultCommittedBucket(
      average,
      level,
      entries,
      encodeBucket(average, level, entries, context),
      context,
    );
  }

  return buckets;
};

export const buildProllyTree = (
  blockstore: Blockstore,
  average: number,
  entries: Entry[],
): CommittedBucket[][] => {
  let level: number = 0;
  let newRoot: CommittedBucket | null = null;

  const treeState: CommittedBucket[][] = [];

  // tree has higher levels
  while (true && level < 100) {
    const buckets = levelOfBuckets(average, level, entries);
    buckets.forEach((b) =>
      blockstore.put(bucketDigestToCid(b.addressed.digest), b.addressed.bytes),
    );
    treeState.push(buckets);

    if (buckets.length === 1) {
      newRoot = buckets[0]!;
      break;
    }

    entries = buckets.map((b) => getBucketEntry(b)!);
    level++;
  }

  if (newRoot == null) {
    throw new Error("Failed to build tree");
  }

  return treeState.reverse();
};

export const createProllyTreeEntry = (
  id: number,
  _: number,
  ids: number[],
): Entry => {
  const key = sha256(new Uint8Array(Array(id).fill(id)));
  // make val unique to tree
  const val = encode(id + -firstElement(ids) + lastElement(ids));
  return new DefaultEntry(id, key, val);
};

export const createProllyTreeEntries = (ids: number[]): Entry[] =>
  ids.map(createProllyTreeEntry);
