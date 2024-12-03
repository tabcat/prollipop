import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { firstElement, lastElement } from "@tabcat/ith-element";
import { Blockstore } from "interface-blockstore";
import { CreateIsBoundary } from "../../src/boundary.js";
import { encodeBucket } from "../../src/codec.js";
import { DefaultBucket, DefaultEntry } from "../../src/impls.js";
import type { Bucket, Entry } from "../../src/interface.js";

/**
 * Creates a function that takes an array of [seq, level] tuples to use as boundaries up to levels.
 *
 * @param boundaries - Array of [seq, level] tuples
 * @returns A function that takes an entry and a level and returns true if the entry is a boundary at the given level.
 */
export const chooseBoundaries =
  (boundaries: [number, number][]): CreateIsBoundary =>
  (_: number, level: number) => {
    return ({ seq }: Entry) => {
      return (
        boundaries.find((b) => b[0] === seq && b[1] >= level) !== undefined
      );
    };
  };

const levelOfEntries = (
  average: number,
  level: number,
  entries: Entry[],
  createIsBoundary: CreateIsBoundary,
): Entry[][] => {
  const entryLevel: Entry[][] = [[]];
  const isBoundary = createIsBoundary(average, level);

  for (const entry of entries) {
    lastElement(entryLevel).push(
      new DefaultEntry(entry.seq, entry.key, entry.val),
    );

    if (isBoundary(entry)) {
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
  createIsBoundary: CreateIsBoundary,
): Bucket[][] => {
  let level: number = 0;
  let entryLevel = levelOfEntries(average, level, entries, createIsBoundary);
  let bucketLevel = levelOfBuckets(average, level, entryLevel);
  bucketLevel.forEach((b) => blockstore.put(b.getCID(), b.getBytes()));

  const treeState: Bucket[][] = [bucketLevel];

  // tree has higher levels
  while (bucketLevel.length > 1) {
    if (level >= 4) {
      throw new Error("e");
    }
    level++;
    entryLevel = levelOfEntries(
      average,
      level,
      nextLevelEntries(bucketLevel),
      createIsBoundary,
    );
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
