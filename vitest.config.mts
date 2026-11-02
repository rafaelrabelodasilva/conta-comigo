import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mesmo alias do tsconfig (`@/*` → `src/*`), para código fora do núcleo.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` só faz sentido no build do Next.js; nos testes vira vazio.
      "server-only": fileURLToPath(
        new URL("./test/server-only-vazio.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx,mts}", "test/**/*.test.{ts,mts}", "*.test.mts"],
    environment: "node",
  },
});
