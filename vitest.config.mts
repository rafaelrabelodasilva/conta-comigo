import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mesmo alias do tsconfig (`@/*` → `src/*`), para código fora do núcleo.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx,mts}", "*.test.mts"],
    environment: "node",
  },
});
