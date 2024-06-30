import * as cbor from 'cborg';
import { encodeOptions } from '@ipld/dag-cbor';
import { cborTreeCodec as treeCodec, sha256Hasher as syncHasher } from "../src/index.js";
import { describe, expect, it } from "vitest";
import { EncodedNode, decodeBucket, decodeNodeFirst, encodeBucket, encodeNode, handleBuffer } from "../src/codec.js";
import { DefaultBucket, DefaultNode } from '../src/impls.js';
import { Bucket, Prefix } from '../src/interface.js';

describe("handleBuffer", () => {
  it("turns a buffer into a byte array", () => {
    const buffer = new ArrayBuffer(0);
    expect(handleBuffer(buffer)).to.deep.equal(new Uint8Array(0));
  });
});

const timestamp = 0
const hash = new Uint8Array(4) // isBoundaryHash expects Uint8Array with length >= 4
const message = new Uint8Array(0)
const node = new DefaultNode(timestamp, hash, message)
const encodedNode: EncodedNode = [timestamp, hash, message]
const nodeBytes = cbor.encode(encodedNode, encodeOptions)
const nodeBytes2 = new Uint8Array([...nodeBytes, ...nodeBytes])

describe("encodeNode", () => {
  it('turns a node into a byte array', () => {
    expect(encodeNode(timestamp, hash, message, treeCodec)).to.deep.equal(nodeBytes)
  })
});

describe("decodeNodeFirst", () => {
  it('turns a byte array into [node class, byte array] tuple', () => {
    expect(decodeNodeFirst(nodeBytes, treeCodec)).to.deep.equal([node, new Uint8Array()])
    expect(decodeNodeFirst(nodeBytes2, treeCodec)).to.deep.equal([node, nodeBytes])
  })
});

type Mc = typeof treeCodec.code
type Mh = typeof syncHasher.code
const prefix: Prefix<Mc, Mh> = { average: 1, level: 0, mc: treeCodec.code, mh: syncHasher.code }
const prefixBytes = cbor.encode(prefix, encodeOptions)
const bucketBytes = new Uint8Array([...prefixBytes, ...nodeBytes])
const bucketHash = syncHasher.digest(bucketBytes).digest
const bucket: Bucket<Mc, Mh> = new DefaultBucket(prefix, [node], bucketBytes, bucketHash)

describe("encodeBucket", () => {
  it('turns a bucket into a byte array', () => {
    expect(encodeBucket(prefix, [node], treeCodec)).to.deep.equal(bucketBytes)
  })
});

describe("decodeBucket", () => {
  it('turns a byte array into a bucket', () => {
    expect(decodeBucket(bucketBytes, treeCodec, syncHasher)).to.deep.equal(bucket)
  })
});
