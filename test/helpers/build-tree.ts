import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { createIsBoundary } from "../../src/boundary.js";
import { encodeBucket } from "../../src/codec.js";
import { DefaultBucket, DefaultEntry } from "../../src/impls.js";
import type { Bucket, Entry } from "../../src/interface.js";

const levelOfEntries = (
  average: number,
  level: number,
  entries: Entry[],
): Entry[][] => {
  const entryLevel: Entry[][] = [[]];
  for (const entry of entries) {
    lastElement(entryLevel).push(
      new DefaultEntry(entry.seq, entry.key, entry.val),
    );

    if (createIsBoundary(average, level)(entry)) {
      entryLevel.push([]);
    }
  }

  if (lastElement(entryLevel).length === 0) {
    entryLevel.pop();
  }

  return entryLevel;
};

const levelOfBuckets = (
  average: number,
  level: number,
  entryLevel: Entry[][],
): Bucket[] => {
  if (entryLevel.length === 0) {
    entryLevel.push([]);
  }

  return entryLevel.map((entries) => {
    const bytes = encodeBucket(average, level, entries);
    return new DefaultBucket(average, level, entries, bytes, sha256(bytes));
  });
};

const nextLevelEntries = (buckets: Bucket[]): Entry[] => {
  const entries: Entry[] = [];
  for (const bucket of buckets) {
    // should never get empty bucket here as there would not be another level
    entries.push({ ...bucket.getBoundary()!, val: bucket.getDigest() });
  }
  return entries;
};

export const buildProllyTreeState = (
  blockstore: Blockstore,
  average: number,
  entries: Entry[],
): Bucket[][] => {
  let level: number = 0;
  let entryLevel = levelOfEntries(average, level, entries);
  let bucketLevel = levelOfBuckets(average, level, entryLevel);
  bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));

  const treeState: Bucket[][] = [bucketLevel];

  // tree has higher levels
  while (bucketLevel.length > 1) {
    if (level >= 4) {
      throw new Error("e");
    }
    level++;
    entryLevel = levelOfEntries(average, level, nextLevelEntries(bucketLevel));
    bucketLevel = levelOfBuckets(average, level, entryLevel);
    bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));
    treeState.push(bucketLevel);
  }

  return treeState.reverse(); // root to base
};

export const createProllyTreeEntries = (ids: number[]): Entry[] =>
  ids.map((id) => {
    const key = sha256(new Uint8Array(Array(id).fill(id)));
    // make val unique to tree
    const val = encode(id + -firstElement(ids) + lastElement(ids));
    return new DefaultEntry(id, key, val);
  });
