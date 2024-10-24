import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest configuration options here
  define: {
    TREE_ENTRIES_MAX: JSON.stringify(process.env.TREE_ENTRIES_MAX ?? 3000),
  },
});
