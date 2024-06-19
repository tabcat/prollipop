/**
 * The default codec to encode buckets and nodes is dag-cbor.
 */

import { encode, decode, decodeFirst } from "cborg";
import type { ByteView, ArrayBufferView, BlockCodec } from "multiformats";
import * as dagCbor from "@ipld/dag-cbor";
import { sha256 } from "multiformats/hashes/sha2";
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

export interface TreeCodec<Code extends number, Alg extends number> extends BlockCodecPlus<Code, Prefix<Code, Alg> | EncodedNode> {}

export const cborTreeCodec = (): TreeCodec<typeof dagCbor.code, typeof sha256.code> => ({
  ...dagCbor,
  encode: (value) => encode(value, dagCbor.encodeOptions),
  decode: (bytes) => decode(handleBuffer(bytes), dagCbor.decodeOptions),
  decodeFirst: (bytes) => decodeFirst(handleBuffer(bytes), dagCbor.decodeOptions),
});
