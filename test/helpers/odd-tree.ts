import { buildProllyTree, createProllyTreeEntries } from "./build-tree.js";
import { average, blockstore } from "./constants.js";

export async function boundaries() {
  return {
    createIsBoundary: (_: number, level: number) => {
      return ({ seq }: { seq: number }) => {
        return seq % 2 === 1 && level === 0;
      };
    },
  };
}

export const oddTreeIds = [0, 1, 2, 3, 4, 5];
export const oddTreeEntries = createProllyTreeEntries(oddTreeIds);

export const oddTree = buildProllyTree(blockstore, average, oddTreeEntries);
