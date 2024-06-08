/**
 * default codec for buckets is dag-cbor
 */

import * as cbor from "cborg";
import type { BlockCodec, ByteView } from "multiformats";
import {
  name,
  code,
  encode as _encode,
  decode as _decode,
  decodeOptions,
  encodeOptions,
} from "@ipld/dag-cbor";

export const encode = <T>(value: T) =>
  cbor.encode(value, encodeOptions) as ByteView<T>;

export const decode = (bytes: Uint8Array) =>
  cbor.decode(bytes, decodeOptions) as unknown;

export const decodeFirst = (bytes: Uint8Array) =>
  cbor.decodeFirst(bytes, decodeOptions) as [unknown, Uint8Array];

export const codec: <T>() => BlockCodec<typeof code, T> = () => ({
  name,
  code,
  encode: _encode,
  decode: _decode,
});
