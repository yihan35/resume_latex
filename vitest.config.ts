import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    fileParallelism: false,
    passWithNoTests: true,
    setupFiles: "./client/src/testSetup.ts",
    include: [
      "server/src/**/*.test.ts",
      "client/src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["client/src/**/*.{ts,tsx}", "server/src/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "client/src/testSetup.ts",
        "client/src/main.tsx",
        "client/src/app/main.tsx",
        "client/src/features/workspace/types.ts",
        "server/src/index.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
