import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The database tests start an in-memory Postgres per file; give them room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
