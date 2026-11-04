import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dossier de build distinct pour le serveur des tests de bout en bout (.next-e2e) : il peut
  // tourner à côté d'un `npm run dev` ouvert, que Next.js refuserait sinon de dédoubler.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
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
