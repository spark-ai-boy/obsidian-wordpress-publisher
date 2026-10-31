import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(import.meta.dirname, "tests/mocks/obsidian.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true
  }
});
