import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Verrou entre workers (fichier exclusif dans le dossier temporaire du poste). Les projets « ordinateur »
// et « mobile-375 » déroulent le même parcours en parallèle, avec des Passages aux vecteurs simulés
// identiques (même question exacte) : à égalité, la réponse simulée ne cite que P1 et P2, et la Source
// d'un autre worker peut être citée, ou supprimée par lui pendant la lecture. Un seul exemplaire du
// parcours à la fois rend la Source citée déterministe. Verrou abandonné (lancement interrompu) :
// supprimé par global-setup.ts avant chaque lancement, et repris après LOCK_STALE_MS pendant un lancement.
export const LOCK_WAIT_MAX_MS = 240_000;
const LOCK_STALE_MS = 300_000;
const LOCK_PREFIX = "nexamind-e2e-";
const LOCK_SUFFIX = ".lock";

// Verrous laissés par un lancement interrompu (appelé une fois, avant les workers).
export function removeJourneyLocks(dir = os.tmpdir()): void {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(LOCK_PREFIX) && name.endsWith(LOCK_SUFFIX)) rmSync(path.join(dir, name), { force: true });
  }
}

export async function acquireJourneyLock(name: string): Promise<() => void> {
  const file = path.join(os.tmpdir(), `${LOCK_PREFIX}${name}${LOCK_SUFFIX}`);
  // Jeton propre à ce détenteur : la libération ne supprime jamais le verrou d'un autre (verrou repris
  // après expiration).
  const token = `${process.pid}-${crypto.randomUUID()}`;
  const deadline = Date.now() + LOCK_WAIT_MAX_MS;
  for (;;) {
    try {
      writeFileSync(file, token, { flag: "wx" });
      return () => {
        try {
          if (readFileSync(file, "utf8") === token) rmSync(file, { force: true });
        } catch {
          // Verrou déjà supprimé.
        }
      };
    } catch {
      try {
        if (Date.now() - statSync(file).mtimeMs > LOCK_STALE_MS) rmSync(file, { force: true });
      } catch {
        // Verrou libéré entre-temps : nouvel essai.
      }
      if (Date.now() > deadline) throw new Error(`Verrou ${name} non obtenu après ${LOCK_WAIT_MAX_MS} ms.`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
