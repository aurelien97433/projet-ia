import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/errors";
import { nextUtcMidnight, type QuotaState } from "@/lib/quota";

export { nextUtcMidnight };

type Db = Pick<SupabaseClient, "from">;

// Jour UTC (AAAA-MM-JJ), comme reserve_ai_call (AD-14).
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Quota du Collaborateur connecté au chargement de l'Assistant (story 5.10, Q1 = A), lu avec SON jeton
// (jamais service_role) : compteur du jour UTC dans ai_usage (politique « Le propriétaire lit ses
// compteurs d'IA » : la RLS ne renvoie que la ligne du Compte de la session vérifiée ; aucun identifiant
// n'est fourni par la page, la requête ou un cookie) et limite ai_limits.ai_daily_quota. Aucune ligne
// du jour : 0. Lecture impossible (réseau, droits, ligne absente ou illisible) : null, journalisé sans
// donnée ; la page s'affiche alors normalement et le refus à l'envoi reste le filet.
export async function getQuota(db: Db, now: Date = new Date()): Promise<QuotaState | null> {
  try {
    const [usage, limit] = await Promise.all([
      db.from("ai_usage").select("count").eq("day_utc", utcDay(now)),
      db.from("ai_limits").select("value").eq("key", "ai_daily_quota").maybeSingle(),
    ]);
    if (usage.error || limit.error) {
      logEvent("quota_read_failed", { source: usage.error ? "usage" : "limit", code: (usage.error ?? limit.error)?.code });
      return null;
    }
    const rows = (usage.data ?? []) as { count?: unknown }[];
    // Plus d'une ligne : impossible avec la RLS (clé user_id + day_utc) ; jamais additionnée.
    if (rows.length > 1) {
      logEvent("quota_read_failed", { source: "usage", cause: "rows" });
      return null;
    }
    const used = rows.length === 0 ? 0 : rows[0].count;
    const value = (limit.data as { value?: unknown } | null)?.value;
    if (!Number.isInteger(used) || (used as number) < 0 || !Number.isInteger(value) || (value as number) < 0) {
      logEvent("quota_read_failed", { source: "parse" });
      return null;
    }
    return { used: used as number, limit: value as number, resetAt: nextUtcMidnight(now) };
  } catch {
    logEvent("quota_read_failed", { source: "network" });
    return null;
  }
}
