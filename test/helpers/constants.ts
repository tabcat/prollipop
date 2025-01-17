import { code as cborCode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { MemoryBlockstore } from "blockstore-core/memory";
import { CID } from "multiformats";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import * as sha2 from "multiformats/hashes/sha2";
import { EncodedEntry } from "../../src/codec.js";
import {
  DefaultBucket,
  DefaultEntry,
  DefaultProllyTree,
} from "../../src/impls.js";
import { entryToTuple } from "../../src/utils.js";

export const blockstore = new MemoryBlockstore();

export const createEntry = (seq: number) => new DefaultEntry(seq, bytes, bytes);
export const createTuple = (seq: number) => entryToTuple(createEntry(seq));
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
export const bucketBytes = encode(encodedBucket);
export const bucketDigest = sha256(bucketBytes);
export const bucket = new DefaultBucket(
  average,
  level,
  entries,
  {
    bytes: bucketBytes,
    digest: bucketDigest,
  },
  { isTail: true, isHead: true },
);
export const addressed = {
  bytes: bucketBytes,
  digest: bucketDigest,
};
export const cid = CID.createV1(
  cborCode,
  createMultihashDigest(sha2.sha256.code, addressed.digest),
);
export const context = {
  isTail: true,
  isHead: true,
};

export const encodedEmptyBucket = {
  average,
  level,
  base: 0,
  entries: [],
};
export const emptyBucketBytes = encode(encodedEmptyBucket);
export const emptyBucketDigest = sha256(emptyBucketBytes);
export const emptyBucket = new DefaultBucket(
  average,
  level,
  [],
  {
    bytes: emptyBucketBytes,
    digest: emptyBucketDigest,
  },
  { isTail: true, isHead: true },
);
export const emptyAddressed = {
  bytes: emptyBucketBytes,
  digest: emptyBucketDigest,
};
export const emptyContext = context;

export const emptyTree = new DefaultProllyTree(emptyBucket);
export const tree = new DefaultProllyTree(bucket);
