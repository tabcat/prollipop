import { code as cborCode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import { MemoryBlockstore } from "blockstore-core/memory";
import { CID } from "multiformats";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import * as sha2 from "multiformats/hashes/sha2";
import { IsBoundary } from "../../src/boundary.js";
import { EncodedEntry } from "../../src/codec.js";
import {
  DefaultBucket,
  DefaultEntry,
  DefaultProllyTree,
} from "../../src/impls.js";
import { Entry } from "../../src/interface.js";

export const blockstore = new MemoryBlockstore();

export const numberToBytes = (n: number): Uint8Array => {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, n, false);
  return new Uint8Array(buf);
};
export const bytesToNumber = (bytes: Uint8Array): number => {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
};

export const createKey = (n: number) => numberToBytes(n);
export const createEntry = (n: number, val: Uint8Array = noBytes) =>
  new DefaultEntry(createKey(n), val);
export const createEncodedEntry = (n: number): EncodedEntry => [
  numberToBytes(n),
  noBytes,
];
export const createBoundaryEntry = (
  i: number,
  isBoundary: IsBoundary,
): Entry => {
  let entry = createEntry(i);

  while (!isBoundary(entry)) {
    i++;
    entry = createEntry(i);
  }

  return entry;
};

export const noBytes = new Uint8Array();

export const key = createKey(0);
export const val = noBytes;
export const entry = createEntry(0);
export const encodedEntry = createEncodedEntry(0);

export const keyRecord = { key };

export const average = 32;
export const level = 0;
export const prefix = { average, level };

export const entries = [entry];
export const encodedEntries: EncodedEntry[] = [encodedEntry];

export const encodedBucket = {
  average,
  level,
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
