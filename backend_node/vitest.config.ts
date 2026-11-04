import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: [
        "src/core/**/*.ts",
        "src/http/**/*.ts",
        "src/infrastructure/**/*.ts",
        "src/auth/**/*.ts",
      ],
      reporter: ["text", "json-summary"],
    },
  },
});
