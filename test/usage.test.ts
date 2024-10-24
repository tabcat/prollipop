import { MemoryBlockstore } from "blockstore-core";
import { describe, expect, it } from "vitest";
import { diff } from "../src/diff.js";
import { cloneTree, createEmptyTree, mutate } from "../src/index.js";
import { Bucket, Entry, ProllyTree } from "../src/interface.js";
import { entryToTuple } from "../src/utils.js";

/**
 * !!!
 * If you are not familiar with content addressed structures, parts of this may be confusing.
 * If parts of this are confusing to you, I recommend visiting the Learning Resources section of the readme.
 * !!!
 */

/**
 * This test can be run from the cli with `pnpm usage` after installing the package with `pnpm install`.
 * It can also be run with the Vitest extension for Vscode.
 */

describe("usage", () => {
  it("explains usage", async () => {
    /**
     * Create a new, empty tree. Trees have one property `root`, which is the root bucket of the tree.
     */
    const tree = createEmptyTree();

    /**
     * Clone a tree. The clone will not be affected if the first tree is mutated.
     * It just makes a shallow copy of the tree, creating a separate reference to the root bucket.
     */
    const clone = cloneTree(tree);

    expect(tree).to.deep.equal(clone);

    /**
     * Blockstores store blocks of data, keyed by the hash of the data called a CID.
     *
     * Find other blockstores that store the data on disk or in the network here: https://github.com/ipfs/js-stores
     * Helia's (https:/github.com/ipfs/helia) blockstore is able to pull from peers on the IPFS network!
     *
     * Fetching blocks of data may be important when diffing trees of remote peers.
     */
    const blockstore = new MemoryBlockstore();

    /**
     * Tuples are made up of a seq and a hash. These are used like keys in a key/value store.
     */
    const tuple = {
      seq: 0,
      key: new Uint8Array(32),
    };

    /**
     * Entries are made up of a seq, hash, and val.
     * The seq and key are the key, while the val is the value.
     * The seq and key give entries a sort, entries are stored in this order in the tree.
     */
    const entry: Entry = {
      ...tuple,
      val: new TextEncoder().encode("hello"),
    };

    /**
     * To add a entry to a tree the mutate function is used. It takes an AwaitIterable of Entries or Tuples.
     * If a entry is supplied it will be added to the tree. If a tuple is supplied, the matching entry (if existing in the tree) will be removed.
     *
     * THE ORDER THE NODES AND TUPLES ARE SUPPLIED IS CRITICAL.
     * THERE CAN BE NO DUPLICATE NODES OR TUPLES PER TUPLE SUPPLIED TO THE SAME MUTATE CALL.
     * VIOLATING EITHER OF THESE WILL RESULT IN INCONSISTENT TREES.
     *
     * The AwaitIterable supplying Entries and Tuples MUST be an ordered set where each element is unique per Tuple.
     * Utility functions for maintaining order can be found in `prollipop/compare`, specifically `compareTuples` which can compare tuples and entries.
     */
    for await (const diff of mutate(blockstore, tree, [entry])) {
      for (const [removed, added] of diff.entries) {
        /**
         * With entry diffs, removed and added could be defined, or only one could be defined.
         * If only one is defined then a entry was either added or removed.
         * If both are defined the entry's val has been changed.
         */

        if (removed != null) {
          console.log(`removed ${removed} from tree.`);
        }

        if (added != null) {
          console.log(`added ${added} to tree.`);
        }
      }

      for (const [removed, added] of diff.buckets) {
        /**
         * With bucket diffs, removed and added cannot both be defined.
         * Either removed is defined and added is null or the opposite.
         */
        if (added != null) {
          console.log(`added ${added} to tree.`);
          console.log(`added ${added} to blockstore.`);
          /**
           * It's important to add any new buckets of the tree to the blockstore.
           * This is so they can be fetched later by cursors used by the mutate and diff functions.
           */
          blockstore.put(added.getCID(), added.getBytes());
        } else {
          console.log(`removed ${removed} from tree.`);
          /**
           * Here removed buckets may be removed from the blockstore.
           */
        }
      }
    }

    /**
     * The mutate function yields entry and buckets diffs but also changes the `root` property of the tree.
     */
    expect(tree).to.not.deep.equal(clone);

    let clone2: ProllyTree;

    /**
     * The diff function can be used to diff two trees.
     * Like mutate, diff yields the different entries and buckets of the trees in a deterministic order.
     */
    for await (const { entries, buckets } of diff(blockstore, clone, tree)) {
      /**
       * By looking at the tree structure while diffing, sections of the tree which are identical can be skipped.
       * This can make diffing a tree stored locally with a remote one efficient as only sections which are different need to be traversed.
       */

      for (const [_local, _remote] of entries) {
        /**
         * To merge a remote tree simply add any remote entries to the local tree like so:
         *
         * if (remote != null) {
         *   for await (const _ of mutate(blockstore, clone, [remote])) {}
         * }
         *
         * or better yet, map the diff to yield remote entries and give directly to mutate:
         *
         * const remoteEntriesAsyncIter = diffsToRemoteEntries(diff(blockstore, clone, tree))
         * for await (const _ of mutate(blockstore, clone, remoteEntriesAsyncIter)) {}
         */
      }

      let lastRemote: Bucket;
      for (const [_local, remote] of buckets) {
        if (remote != null) {
          /**
           * To sync a remote tree simply add remote buckets to the blockstore.
           * In our case the blocks already exist in the blockstore.
           * In a real world case, a second blockstore, which is supplied as the 4th parameter, is network connected.
           */
          blockstore.put(remote.getCID(), remote.getBytes());
          lastRemote = remote;
        }
      }

      /**
       * The last bucket of local and remote will be the root of the tree, respectively.
       */
      clone2 = cloneTree({ root: lastRemote! });
    }

    expect(tree).to.deep.equal(clone2!);

    /**
     * To remove entries from a tree the mutate function is used. But instead of giving it full entries, we give it the tuple (aka the key).
     */
    for await (const _ of mutate(blockstore, tree, [entryToTuple(entry)])) {
      /**
       * Like before any buckets that were added should be added to the blockstore.
       * Any buckets that were removed could be removed safely if not used by other trees.
       */
    }

    expect(tree).to.deep.equal(clone);
  });
});
