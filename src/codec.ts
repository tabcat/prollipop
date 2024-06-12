/**
 * The default codec to encode buckets and nodes is dag-cbor.
 */

import cbor from "cborg";
import type { ByteView, ArrayBufferView } from "multiformats";
import { name, code, decodeOptions, encodeOptions } from "@ipld/dag-cbor";

type Bytes<T> = ByteView<T> | ArrayBufferView<T>;

const handleBuffer = <T>(bytes: Bytes<T>): ByteView<T> =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

export interface BlockCodecPlus<Code extends number> {
  name: string;
  code: Code;
  encode<T>(data: T): ByteView<T>;
  decode<T>(bytes: ByteView<T> | ArrayBufferView<T>): T;
  decodeFirst<T>(bytes: Bytes<T[]>): [T, ByteView<T[]>];
}

export const blockCodecPlus = (): BlockCodecPlus<typeof code> => ({
  name,
  code,
  encode: (value) => cbor.encode(value, encodeOptions),
  decode: (bytes) => cbor.decode(handleBuffer(bytes), decodeOptions),
  decodeFirst: (bytes) => cbor.decodeFirst(handleBuffer(bytes), decodeOptions),
});
