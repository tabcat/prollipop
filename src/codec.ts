/**
 * The default codec to encode buckets and nodes is dag-cbor.
 */

import cbor from "cborg";
import type {
  BlockCodec,
  ByteView,
  ArrayBufferView,
  MultihashHasher,
} from "multiformats";
import {
  name,
  code,
  encode as _encode,
  decode as _decode,
  decodeOptions,
  encodeOptions,
} from "@ipld/dag-cbor";
import { Prefix } from "./bucket";

type Bytes<T> = ByteView<T> | ArrayBufferView<T>;

const handleBuffer = <T>(bytes: Bytes<T>): ByteView<T> =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

export const blockCodecPlus: <T>() => BlockCodecPlus<typeof code, T> = () => ({
  name,
  code,
  encode: <T>(value: T) => cbor.encode(value, encodeOptions) as ByteView<T>,
  decode: <T>(bytes: Bytes<T>) =>
    cbor.decode(handleBuffer(bytes), decodeOptions),
  decodeFirst: <T>(bytes: Bytes<T[]>): [T, ByteView<T[]>] =>
    cbor.decodeFirst(handleBuffer(bytes), decodeOptions),
});

export interface BlockCodecPlus<Code extends number, T>
  extends BlockCodec<Code, T> {
  decodeFirst(bytes: Bytes<T[]>): [T, ByteView<T[]>];
}

export const matchesBucketPrefix =
  <T, Code extends number, Alg extends number>(
    codec: BlockCodecPlus<Code, T>,
    hasher: MultihashHasher<Alg>
  ) =>
  (prefix: Prefix): boolean =>
    prefix.mc === codec.code && prefix.mh === hasher.code;
