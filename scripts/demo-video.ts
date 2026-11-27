// Vidéo de secours (story 7.5) : npm run demo:video, lancé par le porteur du produit seul.
// Annonce la cible, le coût, les unités et le dossier de la vidéo, demande « oui », puis lance
// Playwright avec playwright.video.config.ts (navigateur visible, 1 280 × 720, production, Compte de
// démo A). N'affiche ni e-mail, ni mot de passe, ni URL de production.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { VIDEO_DIR } from "../tests/video/video-dir";

export const PLAN = [
  "Vidéo de secours — production Vercel, vraie IA, Compte de démo A (identifiants lus dans .env.seed).",
  "Parcours : UJ-1 (connexion, Tableau de bord, q1 et sa Source, c1, h1) ; UJ-2 (Note Dorval, prêt, question,",
  "  Résumé, suppression) ; UJ-3 (Recherche « organisation des congés », question et suivi, Historique).",
  "Unités du Compte A : 7 (6 questions et 1 Résumé), sur le quota du jour UTC ; arrêt avant tout appel si le quota ne suffit pas.",
  "Coût estimé : environ 0,05 $ (6 questions à 0,006 $, un Résumé, vectorisation négligeable).",
  "Les Conversations restent dans l'Historique du Compte A ; la Note d'UJ-2 est supprimée, même en cas d'échec.",
  "L'e-mail du Compte A est visible dans la vidéo, comme dans la démonstration ; le mot de passe n'apparaît jamais.",
  `Vidéo écrite hors du dépôt, dans : ${VIDEO_DIR}`,
];

async function main() {
  for (const line of PLAN) console.log(line);
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("Tapez « oui » pour lancer le tournage : ")).trim();
  rl.close();
  if (answer !== "oui") {
    console.log("Tournage annulé, rien n'a été lancé.");
    process.exit(1);
  }
  const result = spawnSync("npx", ["playwright", "test", "--config", "playwright.video.config.ts"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

if (process.argv[1]?.endsWith("demo-video.ts")) void main();
