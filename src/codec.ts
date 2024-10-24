import { decode, encode } from "@ipld/dag-cbor";
import { sha256 } from "@noble/hashes/sha256";
import type { ByteView } from "multiformats";
import { compareEntries } from "./compare.js";
import { DefaultBucket, DefaultEntry } from "./impls.js";
import { Bucket, Entry, Prefix } from "./interface.js";
import { entriesToDeltaBase } from "./utils.js";

type EncodedEntry = [Entry["seq"], Entry["key"], Entry["val"]];

export interface EncodedBucket {
  level: number;
  average: number;
  base: number;
  entries: EncodedEntry[];
}

const getValidatedEntry = (encodedEntry: unknown): EncodedEntry => {
  if (typeof encodedEntry !== "object" || !Array.isArray(encodedEntry)) {
    throw new TypeError("Expected encoded entry to be an array.");
  }

  const [seq, key, val] = encodedEntry as Partial<EncodedEntry>;

  if (typeof seq !== "number") {
    throw new TypeError("Expected entry seq field to be a number.");
  }

  if (!(key instanceof Uint8Array)) {
    throw new TypeError("Expected entry key field to be a byte array.");
  }

  if (!(val instanceof Uint8Array)) {
    throw new TypeError("Expected entry val field to be a byte array.");
  }

  return [seq, key, val];
};

const getValidatedPrefix = (prefix: unknown): Prefix => {
  if (typeof prefix !== "object") {
    throw new TypeError("Expected bucket prefix to be an object.");
  }

  const { average, level, base } = prefix as Partial<Prefix>;

  if (typeof average !== "number") {
    throw new TypeError("Expected prefix average field to be a number.");
  }

  if (typeof level !== "number") {
    throw new TypeError("Expected prefix level field to be a number.");
  }

  if (typeof base !== "number") {
    throw new TypeError("Expected prefix base field to be a number.");
  }

  return { average, level, base };
};

const getValidatedBucket = (bucket: unknown): EncodedBucket => {
  if (typeof bucket !== "object" || bucket == null) {
    throw new TypeError("Expected bucket to be an object.");
  }

  const { average, level, base } = getValidatedPrefix(bucket);

  const { entries } = bucket as Partial<EncodedBucket>;

  if (typeof entries !== "object" || !Array.isArray(entries)) {
    throw new TypeError("Expected bucket entries field to be a number.");
  }

  return { average, level, base, entries };
};

export function encodeBucket(
  average: number,
  level: number,
  entries: Entry[],
): ByteView<EncodedBucket> {
  const base = entriesToDeltaBase(entries);

  entries.sort(compareEntries);

  let i = entries.length;
  const encodedEntries: EncodedEntry[] = new Array(i);
  let delta = base;
  while (i > 0) {
    i--;
    const { seq, key, val } = entries[i]!;
    encodedEntries[i] = [delta - seq, key, val];
    delta = seq;
  }

  return encode({
    average,
    level,
    base,
    entries: encodedEntries,
  });
}

export function decodeBucket(
  bytes: Uint8Array,
  expectedPrefix: Prefix,
): Bucket {
  const decoded = decode(bytes);

  const {
    average,
    level,
    base,
    entries: encodedEntries,
  } = getValidatedBucket(decoded);

  if (average !== expectedPrefix.average) {
    throw new TypeError(
      `Expect prefix to have average ${expectedPrefix.average}. Received prefix with average ${average}`,
    );
  }

  if (level !== expectedPrefix.level) {
    throw new TypeError(
      `Expect prefix to have level ${expectedPrefix.level}. Received prefix with level ${level}`,
    );
  }

  if (base !== expectedPrefix.base) {
    throw new TypeError(
      `Expect prefix to have base ${expectedPrefix.base}. Received prefix with base ${base}`,
    );
  }

  // could validate boundaries and tuple order here
  let i = encodedEntries.length;
  const entries: Entry[] = new Array(i);
  let delta: number = base;
  while (i > 0) {
    i--;
    const encodedEntry = encodedEntries[i];
    const [seq, key, val] = getValidatedEntry(encodedEntry);
    entries[i] = new DefaultEntry((delta -= seq), key, val);
  }

  return new DefaultBucket(average, level, entries, bytes, sha256(bytes));
}
