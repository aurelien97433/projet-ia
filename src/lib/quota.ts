// Quota quotidien du Collaborateur connecté (story 5.10) : questions utilisées le jour UTC, limite du
// Compte, prochain 00:00 UTC (ISO). Lu côté serveur (src/server/quota/get-quota.ts), passé à la page.
export type QuotaState = { used: number; limit: number; resetAt: string };

// Limite atteinte au chargement : moment du rétablissement (resetAt), sinon null.
export const quotaReachedUntil = (quota: QuotaState | null | undefined): string | null =>
  quota && quota.used >= quota.limit ? quota.resetAt : null;

// Prochain 00:00 UTC (ISO), comme reserve_ai_call (AD-14).
export const nextUtcMidnight = (now: Date = new Date()): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
