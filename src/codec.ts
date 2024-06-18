/**
 * The default codec to encode buckets and nodes is dag-cbor.
 */

import cbor from "cborg";
import type { ByteView, ArrayBufferView, BlockCodec } from "multiformats";
import { name, code, decodeOptions, encodeOptions } from "@ipld/dag-cbor";
import { EncodedNode } from "./node";
import { Prefix } from "./bucket";

type Bytes<T> = ByteView<T> | ArrayBufferView<T>;

const handleBuffer = <T>(bytes: Bytes<T>): ByteView<T> =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

export interface BlockCodecPlus<Code extends number, Universe = any> extends BlockCodec<Code, Universe> {
  name: string;
  code: Code;
  encode<T extends Universe>(data: T): ByteView<T>;
  decode<T extends Universe>(bytes: ByteView<T> | ArrayBufferView<T>): T;
  decodeFirst<U extends Universe[]>(
    bytes: Bytes<U>
  ): [U[0], ByteView<U extends [Universe, ...infer B] ? B : U>] // checks if U is a tuple or an array
}

export interface TreeCodec<Code extends number> extends BlockCodecPlus<Code, Prefix | EncodedNode> {}

export const cborTreeCodec = (): TreeCodec<typeof code> => ({
  name,
  code,
  encode: (value) => cbor.encode(value, encodeOptions),
  decode: (bytes) => cbor.decode(handleBuffer(bytes), decodeOptions),
  decodeFirst: (bytes) => cbor.decodeFirst(handleBuffer(bytes), decodeOptions),
});
