import { describe, expect, it } from "vitest";
import { AddUpdate, RmUpdate, mutateTree } from "../src/builder.js";
import { cborTreeCodec, sha256SyncHasher } from "../src/index.js";
import { createEmptyTree } from "../src/utils.js";
import { blockstore, prefix } from "./helpers/constants.js";
import {
  createProllyTree,
  createProllyTreeNodes,
} from "./helpers/create-tree.js";

describe("builder", () => {
  describe("mutateTree", () => {
    it("adds and removes nodes to/from an empty tree", async () => {
      const nodes = createProllyTreeNodes([1], sha256SyncHasher);
      const tree = createEmptyTree(cborTreeCodec, sha256SyncHasher, {
        averageBucketSize: prefix.average,
      });
      await blockstore.put(tree.root.getCID(), tree.root.getBytes());

      for await (const _ of mutateTree(
        blockstore,
        tree,
        nodes.map<AddUpdate>((n) => ({ op: "add", value: n })),
      )) {
      }

      expect(tree).to.deep.equal(
        createProllyTree(
          blockstore,
          prefix,
          nodes,
          cborTreeCodec,
          sha256SyncHasher,
        )[0],
      );

      for await (const _ of mutateTree(
        blockstore,
        tree,
        nodes.map<RmUpdate>((n) => ({ op: "rm", value: n })),
      )) {
      }

      expect(tree).to.deep.equal(
        createProllyTree(
          blockstore,
          prefix,
          [],
          cborTreeCodec,
          sha256SyncHasher,
        )[0],
      );
    });

    it("removes and adds nodes from/to a tree", async () => {
      const nodes = createProllyTreeNodes([1], sha256SyncHasher);
      const tree = createProllyTree(
        blockstore,
        prefix,
        nodes,
        cborTreeCodec,
        sha256SyncHasher,
      )[0];
      await blockstore.put(tree.root.getCID(), tree.root.getBytes());

      for await (const _ of mutateTree(
        blockstore,
        tree,
        nodes.map<RmUpdate>((n) => ({ op: "rm", value: n })),
      )) {
      }

      expect(tree).to.deep.equal(
        createProllyTree(
          blockstore,
          prefix,
          [],
          cborTreeCodec,
          sha256SyncHasher,
        )[0],
      );

      for await (const _ of mutateTree(
        blockstore,
        tree,
        nodes.map<AddUpdate>((n) => ({ op: "add", value: n })),
      )) {
      }

      expect(tree).to.deep.equal(
        createProllyTree(
          blockstore,
          prefix,
          nodes,
          cborTreeCodec,
          sha256SyncHasher,
        )[0],
      );
    });
  });
});
