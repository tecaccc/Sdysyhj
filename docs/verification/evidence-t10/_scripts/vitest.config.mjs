import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["suite-*.test.tsx", "suite-*.test.ts"],
    environment: "node",
    testTimeout: 120000,
    hookTimeout: 120000,
    pool: "forks",
    fileParallelism: false,
  },
  esbuild: { jsx: "automatic" },
});
