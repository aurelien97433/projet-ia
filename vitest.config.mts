import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const resolve = {
  alias: {
    "@": path.resolve(import.meta.dirname, "src"),
    // « server-only » lève une erreur hors du serveur React ; sa version neutre est utilisée en test.
    "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
  },
};

// Story 6.1 : chat.test.ts et summary.test.ts réservent sur le compteur global du jour (ai_usage_global)
// et modifient temporairement le plafond global ; ils vérifient des écarts exacts. En parallèle, chacun
// fausse l'autre : ils tournent seuls, l'un après l'autre, après tous les autres fichiers.
const QUOTA_FILES = ["tests/integration/chat.test.ts", "tests/integration/summary.test.ts"];

const base = {
  environment: "node",
  // Les tests d'intégration interrogent Supabase local, parfois par la CLI (plusieurs secondes par
  // appel, davantage quand plusieurs fichiers l'appellent en parallèle) : le délai par défaut de 5 s
  // les fait échouer sans défaut réel.
  testTimeout: 60_000,
} as const;

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          ...base,
          name: "principal",
          // Composants (.test.tsx) : environnement jsdom déclaré par fichier, les autres tests restent en node.
          include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...QUOTA_FILES],
          sequence: { groupOrder: 0 },
        },
      },
      {
        resolve,
        test: { ...base, name: "quota-global", include: QUOTA_FILES, fileParallelism: false, sequence: { groupOrder: 1 } },
      },
    ],
  },
});
