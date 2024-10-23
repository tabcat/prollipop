import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest configuration options here
  define: {
    TREE_NODES_MAX: JSON.stringify(process.env.TREE_NODES_MAX ?? 3000),
  },
});
