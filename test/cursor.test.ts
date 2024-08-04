import { firstElement, ithElement, lastElement } from "@tabcat/ith-element";
import { describe, expect, it } from "vitest";
import { compareTuples } from "../src/compare.js";
import {
  CursorState,
  bucketOf,
  createCursorState,
  createNextOnLevel,
  getIsExtremity,
  levelOf,
  moveSideways,
  moveToLevel,
  moveToNextBucket,
  nodeOf,
  rootLevelOf,
} from "../src/cursor.js";
import {
  levelExceedsRoot,
  levelIsNegative,
  levelMustChange,
} from "../src/errors.js";
import { cborTreeCodec, sha256SyncHasher } from "../src/index.js";
import { Bucket, Tuple } from "../src/interface.js";
import { findFailure, findFailureOrLastIndex } from "../src/utils.js";
import { blockstore, prefix } from "./helpers/constants.js";
import {
  createProllyTree,
  createProllyTreeNodes,
} from "./helpers/create-tree.js";

const nodes = createProllyTreeNodes(
  Array(1000)
    .fill(0)
    .map((_, i) => i),
  sha256SyncHasher,
);
const [tree, treeState] = createProllyTree(
  blockstore,
  { ...prefix, average: 10 },
  nodes,
  cborTreeCodec,
  sha256SyncHasher,
);

const moveToExtremityOnLevel = <Code extends number, Alg extends number>(
  treeState: Bucket<Code, Alg>[][],
  cursorState: CursorState<Code, Alg>,
  level: number,
  findExtemity: (buckets: Bucket<Code, Alg>[]) => Bucket<Code, Alg>,
) => {
  const path = treeState
    .map((bucketLevel) => findExtemity(bucketLevel))
    .filter((bucket) => bucket.prefix.level >= level);
  cursorState.currentBuckets = path;
};

describe("cursor", () => {
  describe("getIsExtremity", () => {
    it("returns true if the current bucket is a head or tail", () => {
      const cursorState = createCursorState(blockstore, tree);

      // move to root
      moveToExtremityOnLevel(
        treeState,
        cursorState,
        treeState.length - 1,
        firstElement,
      );
      expect(getIsExtremity(cursorState, firstElement)).to.equal(true);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(true);

      // move to level treeState.length / 2 tail
      moveToExtremityOnLevel(
        treeState,
        cursorState,
        Math.floor(treeState.length / 2),
        firstElement,
      );
      expect(getIsExtremity(cursorState, firstElement)).to.equal(true);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(false);

      // move to level treeState.length / 2 head
      moveToExtremityOnLevel(
        treeState,
        cursorState,
        Math.floor(treeState.length / 2),
        lastElement,
      );
      expect(getIsExtremity(cursorState, firstElement)).to.equal(false);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(true);

      // move to level 0 tail
      moveToExtremityOnLevel(treeState, cursorState, 0, firstElement);
      expect(getIsExtremity(cursorState, firstElement)).to.equal(true);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(false);

      // move to level 0 head
      moveToExtremityOnLevel(treeState, cursorState, 0, lastElement);
      expect(getIsExtremity(cursorState, firstElement)).to.equal(false);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(true);
    });

    it("returns false if the current bucket is not a head or tail", () => {
      const cursorState = createCursorState(blockstore, tree);
      const midElement = <T>(array: T[]): T =>
        ithElement(array, Math.floor(array.length / 2));

      // move to level treeState.length / 2 tail
      moveToExtremityOnLevel(
        treeState,
        cursorState,
        Math.floor(treeState.length / 2),
        midElement,
      );
      expect(getIsExtremity(cursorState, firstElement)).to.equal(false);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(false);

      // move to level 0
      moveToExtremityOnLevel(treeState, cursorState, 0, midElement);
      expect(getIsExtremity(cursorState, firstElement)).to.equal(false);
      expect(getIsExtremity(cursorState, lastElement)).to.equal(false);
    });
  });

  describe("moveToLevel", () => {
    it("moves the cursor to the requested level", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);

      const findBucket =
        (target: Tuple) =>
        <Code extends number, Alg extends number>(
          buckets: Bucket<Code, Alg>[],
        ): Bucket<Code, Alg> =>
          ithElement(
            buckets,
            Math.min(
              findFailure(
                buckets,
                (b) => compareTuples(target, lastElement(b.nodes)) > 0,
              ),
              buckets.length - 1,
            ),
          );

      await moveToLevel(cursorState, 0);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: bucketOf(cursorState).nodes.length - 1,
        currentBuckets: treeState.map(findBucket(nodeOf(rootCursorState))),
      });

      await moveToLevel(cursorState, levelOf(rootCursorState));
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
      });
    });

    it("accepts optional target", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);

      await moveToLevel(cursorState, 0, () => 0);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: 0,
        currentBuckets: treeState.map(firstElement),
      });

      await moveToLevel(
        cursorState,
        levelOf(rootCursorState),
        (nodes) => nodes.length - 1,
      );
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: bucketOf(rootCursorState).nodes.length - 1,
      });

      await moveToLevel(cursorState, 0, (nodes) => nodes.length - 1);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: lastElement(lastElement(treeState)).nodes.length - 1,
        currentBuckets: treeState.map(lastElement),
      });
    });

    it("rejects if given level matches cursor level", () => {
      const cursorState = createCursorState(blockstore, tree);
      expect(() =>
        moveToLevel(cursorState, levelOf(cursorState)),
      ).rejects.toMatchObject(levelMustChange(levelOf(cursorState)));
    });

    it("rejects if given level is negative", () => {
      const cursorState = createCursorState(blockstore, tree);
      expect(() => moveToLevel(cursorState, -1)).rejects.toMatchObject(
        levelIsNegative(),
      );
    });

    it("rejects if given level is higher than root", () => {
      const cursorState = createCursorState(blockstore, tree);
      const currentLevel = levelOf(cursorState);
      expect(() =>
        moveToLevel(cursorState, currentLevel + 1),
      ).rejects.toMatchObject(levelExceedsRoot(currentLevel + 1, currentLevel));
    });
  });

  describe("moveSideways", () => {
    it("increases cursor currentIndex by one", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);
      await moveSideways(cursorState);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: 1,
      });
      await moveSideways(cursorState);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: 2,
      });
    });

    it("if overflows, moves over one bucket", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);

      cursorState.currentBuckets = treeState.slice(-2).map(firstElement);
      cursorState.currentIndex =
        lastElement(cursorState.currentBuckets).nodes.length - 1;

      await moveSideways(cursorState);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentBuckets: treeState.slice(-2).map((buckets, i) => buckets[i]),
        currentIndex: 0,
      });
    });

    it("if overflows on root, sets cursor done", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);
      const currentIndex =
        lastElement(cursorState.currentBuckets).nodes.length - 1;

      cursorState.currentIndex = currentIndex;

      expect(cursorState.isDone).to.equal(false);
      await moveSideways(cursorState);
      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex,
        isDone: true,
      });
    });
  });

  describe("moveToTupleOnLevel", () => {
    it("moves the cursor to the closest tuple on the requested level", () => {});
  });

  describe("moveToNextBucket", () => {
    it("moves the cursor to the next bucket on the same level", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);

      cursorState.currentBuckets = treeState.map(firstElement);

      await moveToNextBucket(cursorState);

      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentBuckets: treeState.map((buckets, i, levels) =>
          i === levels.length - 1
            ? ithElement(buckets, 1)
            : firstElement(buckets),
        ),
      });
    });

    it("if overflows then set cursor to done", async () => {
      let cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);

      await moveToNextBucket(cursorState);

      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentIndex: firstElement(treeState.map(lastElement)).nodes.length - 1,
        isDone: true,
      });

      cursorState = createCursorState(blockstore, tree);
      cursorState.currentBuckets = treeState.map(lastElement);

      await moveToNextBucket(cursorState);

      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        currentBuckets: treeState.map(lastElement),
        currentIndex: lastElement(treeState.map(lastElement)).nodes.length - 1,
        isDone: true,
      });
    });
  });

  describe("createNextOnLevel", () => {
    it("moves to next tuple on requested level", async () => {
      // same level, no overflow
      let cursorState = createCursorState(blockstore, tree);
      let nextOnLevel = createNextOnLevel(cursorState);
      await nextOnLevel(rootLevelOf(cursorState));
      expect(cursorState).to.deep.equal({
        ...createCursorState(blockstore, tree),
        currentIndex: 1,
      });

      // same level, overflows
      cursorState = createCursorState(blockstore, tree);
      nextOnLevel = createNextOnLevel(cursorState);
      cursorState.currentBuckets = treeState.map(firstElement);
      cursorState.currentIndex =
        firstElement(lastElement(treeState)).nodes.length - 1;
      await nextOnLevel(0);
      expect(cursorState).to.deep.equal({
        ...createCursorState(blockstore, tree),
        currentBuckets: treeState.map((buckets, i, levels) =>
          i === levels.length - 1
            ? ithElement(buckets, 1)
            : firstElement(buckets),
        ),
        currentIndex: 0,
      });

      // lower level
      cursorState = createCursorState(blockstore, tree);
      nextOnLevel = createNextOnLevel(cursorState);
      await nextOnLevel(0);
      expect(cursorState).to.deep.equal({
        ...createCursorState(blockstore, tree),
        currentBuckets: treeState.map((buckets) =>
          ithElement(
            buckets,
            findFailureOrLastIndex(
              buckets,
              (b) =>
                compareTuples(lastElement(b.nodes), nodeOf(cursorState)) < 0,
            ),
          ),
        ),
      });

      // higher level
      cursorState = createCursorState(blockstore, tree);
      nextOnLevel = createNextOnLevel(cursorState);
      await nextOnLevel(0);
      await nextOnLevel(rootLevelOf(cursorState));
      expect(cursorState).to.deep.equal({
        ...createCursorState(blockstore, tree),
        currentIndex: 2,
      });
    });

    it("sets cursor to done if requested level is > root", async () => {
      const cursorState = createCursorState(blockstore, tree);
      const rootCursorState = createCursorState(blockstore, tree);
      const nextOnLevel = createNextOnLevel(cursorState);
      await nextOnLevel(rootLevelOf(cursorState) + 1);

      expect(cursorState).to.deep.equal({
        ...rootCursorState,
        isDone: true,
      });
    });
  });
});
