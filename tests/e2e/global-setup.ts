import { localSqlRows, localSupabase } from "../support/local-supabase";

// Préparation des tests de bout en bout (story 5.2b) : les compteurs du garde-fou du crédit d'IA
// (quota par Compte, plafond global du jour, réservations) sont remis à zéro à chaque lancement, sans
// manipulation à la main : deux lancements le même jour ne butent jamais sur le plafond global.
// Refusée si la cible n'est pas la pile locale (127.0.0.1) : jamais sur le projet distant.
export const AI_COUNTER_TABLES = ["ai_reservations", "ai_usage", "ai_usage_global"] as const;

export function assertLocalTarget(url: string): void {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Adresse illisible : refusée ci-dessous.
  }
  if (hostname !== "127.0.0.1") {
    throw new Error("Remise à zéro des compteurs d'IA refusée : la cible n'est pas la pile Supabase locale (127.0.0.1).");
  }
}

type Sql = (sql: string) => Record<string, unknown>[];

export function resetAiCounters(url: string, sql: Sql = localSqlRows): void {
  assertLocalTarget(url);
  // `supabase db query` vise la base locale par défaut (jamais --remote ici).
  sql(`truncate table ${AI_COUNTER_TABLES.map((table) => `public.${table}`).join(", ")}`);
  const rows = sql(
    `select ${AI_COUNTER_TABLES.map((table) => `(select count(*) from public.${table}) as ${table}`).join(", ")}`,
  );
  // Vérification stricte : exactement une ligne, et pour chaque table une valeur présente, numérique
  // et nulle. Une réponse vide ou incomplète n'est jamais prise pour un succès.
  if (rows.length !== 1) throw new Error(`Vérification des compteurs d'IA illisible : ${rows.length} ligne(s) au lieu d'une.`);
  const left = AI_COUNTER_TABLES.filter((table) => {
    const value = rows[0][table];
    const count = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    return !(count === 0);
  });
  if (left.length > 0) throw new Error(`Compteurs d'IA non remis à zéro ou illisibles : ${left.join(", ")}.`);
}

export default function globalSetup(): void {
  resetAiCounters(localSupabase().url);
}
