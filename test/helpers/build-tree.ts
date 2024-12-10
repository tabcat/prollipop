import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { createIsBoundary } from "../../src/boundary.js";
import { encodeBucket } from "../../src/codec.js";
import { DefaultBucket, DefaultEntry } from "../../src/impls.js";
import type { Bucket, Entry } from "../../src/interface.js";

const levelOfBuckets = (
  average: number,
  level: number,
  entries: Entry[],
): Bucket[] => {
  const isBoundary = createIsBoundary(average, level);
  const buckets: Bucket[] = [];
  let bucketEntries: Entry[] = [];

  for (const entry of entries) {
    bucketEntries.push(new DefaultEntry(entry.seq, entry.key, entry.val));

    if (isBoundary(entry)) {
      const bytes = encodeBucket(average, level, bucketEntries);
      buckets.push(
        new DefaultBucket(average, level, bucketEntries, bytes, sha256(bytes)),
      );
      bucketEntries = [];
    }
  }

  const bytes = encodeBucket(average, level, bucketEntries);
  buckets.push(
    new DefaultBucket(average, level, bucketEntries, bytes, sha256(bytes)),
  );

  if (buckets.length > 1 && lastElement(buckets).entries.length === 0) {
    buckets.pop();
  }

  return buckets;
};

export const buildProllyTree = (
  blockstore: Blockstore,
  average: number,
  entries: Entry[],
): Bucket[][] => {
  let level: number = 0;
  let newRoot: Bucket | null = null;

  const treeState: Bucket[][] = [];

  // tree has higher levels
  while (true && level < 100) {
    const buckets = levelOfBuckets(average, level, entries);
    treeState.push(buckets);
    buckets.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));

    if (buckets.length === 1) {
      newRoot = buckets[0]!;
      break;
    }

    entries = buckets.map((b) => b.getParentEntry()!);
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
