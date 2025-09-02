import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    isolate: true,
    // pool: "threads", // or 'forks' if preferred
    // poolOptions: {
    //   threads: {
    //     singleThread: true, // run in one thread
    //     isolate: false, // optional, disables isolation
    //     execArgv: [
    //       "--cpu-prof",
    //       "--cpu-prof-dir=test-runner-profile",
    //       "--heap-prof",
    //       "--heap-prof-dir=test-runner-profile",
    //     ],
    //   },
    // },
    // include: ['./test/codec.test.ts'],
    // include: ['./test/diff.test.ts'],
    testTimeout: 5000,
  },
});
