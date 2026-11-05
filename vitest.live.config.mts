import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";

// Tests réels de l'IA (`npm run test:ai`) : appellent le fournisseur à travers la fonction locale
// ai-health. Séparés de `npm test`, qui ne doit ni dépendre de la clé ni coûter quoi que ce soit.
// Configuration reprise sans mergeConfig, qui additionnerait les motifs `include`.
export default defineConfig({
  resolve: base.resolve,
  test: { environment: "node", include: ["tests/live/**/*.test.ts"], testTimeout: 60_000 },
});
