import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // « server-only » lève une erreur hors du serveur React ; sa version neutre est utilisée en test.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Les tests d'intégration interrogent Supabase local, parfois par la CLI (plusieurs secondes par
    // appel, davantage quand plusieurs fichiers l'appellent en parallèle) : le délai par défaut de 5 s
    // les fait échouer sans défaut réel.
    testTimeout: 60_000,
  },
});
