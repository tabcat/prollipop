import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it } from "vitest";
import { Prollipop } from "../src/database.js";
import { createEmptyTree } from "../src/index.js";
import { bucketDigestToCid } from "../src/utils.js";

describe("database", () => {
  it("puts and gets strings", async () => {
    const blockstore = new MemoryBlockstore();
    const emptyTree = createEmptyTree();
    const { digest, bytes } = emptyTree.root.getAddressed();
    const cid = bucketDigestToCid(digest);
    blockstore.put(cid, bytes);

    const db = new Prollipop(blockstore, cid);

    await db.put("key", "value");
    const result = await db.get("key");
    expect(result).toBe("value");
  });

  it("get returns undefined if the key does not exist", async () => {
    const blockstore = new MemoryBlockstore();
    const emptyTree = createEmptyTree();
    const { digest, bytes } = emptyTree.root.getAddressed();
    const cid = bucketDigestToCid(digest);
    blockstore.put(cid, bytes);

    const db = new Prollipop(blockstore, cid);

    const result = await db.get("key");
    expect(result).toBeUndefined();
  });
});
