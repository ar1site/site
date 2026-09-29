import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lança erro fora do servidor do Next; nos testes vira um módulo vazio.
      "server-only": fileURLToPath(new URL("./tests/ajuda/server-only.ts", import.meta.url)),
    },
  },
});
