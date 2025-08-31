/**
 * A database abstraction for easier use.
 *
 * This might be removed in the future when I make a crdt database in a separate package.
 */

import { Blockstore } from "interface-blockstore";
import { CID } from "multiformats/cid";
import { loadTree, mutate, search } from "./index.js";
import { Entry } from "./interface.js";
import { bucketDigestToCid } from "./utils.js";

/**
 * example usage:
 * 
 * ```
 * import { Prollipop } from "prollipop/database";
 * import { createEmptyTree } from "prollipop";
 * import { MemoryBlockstore } from "blockstore-core";
 * 
 * const blockstore = new MemoryBlockstore();
 * const emptyTree = createEmptyTree();
 * const { digest, bytes } = emptyTree.root.getAddressed();

 * blockstore.put(bucketDigestToCid(digest), bytes);

 * const db = new Prollipop(blockstore, bucketDigestToCid(digest));

 * console.log("new root", db.root);

 * await db.put("key", "value");

 * console.log("new root", db.root);

 * const myValue = await db.get("key");

 * console.log("key", myValue);

 * ```
 */

export class Prollipop {
  constructor(
    public readonly blockstore: Blockstore,
    public root: CID,
  ) {}

  async put(key: string, value: string): Promise<void> {
    const tree = await loadTree(this.blockstore, this.root);
    const entry: Entry = {
      key: new TextEncoder().encode(key),
      val: new TextEncoder().encode(value),
    };

    if (typeof value !== "string") {
      throw new Error("Value must be a string");
    }

    for await (const { buckets } of mutate(this.blockstore, tree, [[entry]])) {
      for (const [_, added] of buckets) {
        if (added == null) continue;

        const { digest, bytes } = added.getAddressed();
        this.blockstore.put(bucketDigestToCid(digest), bytes);
      }
    }

    this.root = bucketDigestToCid(tree.root.getAddressed().digest);
  }

  async get(key: string): Promise<string | undefined> {
    const tree = await loadTree(this.blockstore, this.root);

    for await (const [entry] of search(this.blockstore, tree, [
      [{ key: new TextEncoder().encode(key) }],
    ])) {
      if (entry != null && "val" in entry && entry.val instanceof Uint8Array) {
        return new TextDecoder().decode(entry.val);
      }
    }

    return undefined;
  }
}
