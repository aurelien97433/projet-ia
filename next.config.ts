import type { NextConfig } from "next";

// Story 7.8 (R9) : en-têtes de sécurité sur toutes les réponses. Aucune page n'est faite pour être
// affichée dans un cadre (frame-ancestors 'none', X-Frame-Options pour les anciens navigateurs) ; le type
// de contenu déclaré fait foi (nosniff) ; l'adresse complète (identifiants de Document ou de
// Conversation) ne part jamais vers un autre site. Pas de politique de contenu complète : elle
// demanderait un nonce par requête, hors du périmètre de la démo.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
] as const;

const nextConfig: NextConfig = {
  // Dossier de build distinct pour le serveur des tests de bout en bout (.next-e2e) : il peut
  // tourner à côté d'un `npm run dev` ouvert, que Next.js refuserait sinon de dédoubler.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Story 7.8 (R10) : une Note fait au plus 100 000 octets (MAX_TEXT_BYTES, décision du 2026-11-12) ;
    // la limite de 2 Mo venait de l'ancienne limite de 1 000 000 octets. 1 Mo (valeur par défaut, écrite
    // pour qu'aucune version ne la change) laisse une marge de 10 fois : le schéma zod répond toujours
    // en français pour un texte trop long, et une requête plus grosse est refusée avant toute lecture.
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
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
