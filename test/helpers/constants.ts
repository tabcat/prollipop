import { encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { MemoryBlockstore } from "blockstore-core/memory";
import { EncodedEntry } from "../../src/codec.js";
import {
  DefaultCommittedBucket,
  DefaultEntry,
  DefaultProllyTree,
} from "../../src/impls.js";

export const blockstore = new MemoryBlockstore();

export const createEntry = (seq: number) => new DefaultEntry(seq, bytes, bytes);
export const createEncodedEntry = (delta: number): EncodedEntry => [
  delta,
  bytes,
  bytes,
];

export const bytes = new Uint8Array();

export const seq = 0;
export const key = bytes;
export const val = bytes;
export const tuple = { seq, key };
export const entry = createEntry(seq);
export const encodedEntry = createEncodedEntry(seq);

export const average = 32;
export const level = 0;
export const base = 0;
export const prefix = { average, level, base };

export const entries = [entry];
export const encodedEntries: EncodedEntry[] = [encodedEntry];

export const encodedBucket = {
  average,
  level,
  base,
  entries: encodedEntries,
};
export const encodedBucketBytes = encode(encodedBucket);
export const bucketDigest = sha256(encodedBucketBytes);
export const bucket = new DefaultCommittedBucket(
  average,
  level,
  entries,
  {
    bytes: encodedBucketBytes,
    digest: bucketDigest,
  },
  { isTail: true, isHead: true },
);

export const encodedEmptyBucket = {
  average,
  level,
  base: 0,
  entries: [],
};
export const encodedEmptyBucketBytes = encode(encodedEmptyBucket);
export const emptyBucket = new DefaultCommittedBucket(
  average,
  level,
  [],
  {
    bytes: encodedEmptyBucketBytes,
    digest: sha256(encodedEmptyBucketBytes),
  },
  { isTail: true, isHead: true },
);

export const emptyTree = new DefaultProllyTree(emptyBucket);
export const tree = new DefaultProllyTree(bucket);
