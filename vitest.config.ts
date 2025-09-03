import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    isolate: true,
    testTimeout: 5000,
  },
});
