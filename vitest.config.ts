import { defineConfig } from "vitest/config";

const stress = process.env.TEST_STRESS === "true";

export default defineConfig({
  test: {
    include: !stress ? ["./test/*.test.ts"] : ["./test/stress/*.test.ts"],
    isolate: stress,
  },
});
