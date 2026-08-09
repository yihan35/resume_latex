import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    setupFiles: "./client/src/testSetup.ts",
    include: ["server/src/**/*.test.ts", "client/src/**/*.test.tsx"]
  }
});
