import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dossier de build distinct pour le serveur des tests de bout en bout (.next-e2e) : il peut
  // tourner à côté d'un `npm run dev` ouvert, que Next.js refuserait sinon de dédoubler.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Une Note peut atteindre 1 000 000 octets (plus l'enveloppe de la requête) : la limite par
    // défaut de 1 Mo des Server Actions répondrait avant le schéma zod et son message en français.
    serverActions: { bodySizeLimit: "2mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
