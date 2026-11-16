// Moment du rétablissement du quota (EXPERIENCE.md, « Format de {moment} ») : « aujourd'hui à {heure} »
// ou « demain à {heure} », dans un fuseau donné (celui du navigateur en 5.10). Côté serveur, le fuseau
// du navigateur est inconnu : le relais de chat (story 5.2a-2) l'écrit en UTC, en le précisant.
export function formatResetMoment(resetAt: string, now: Date = new Date(), timeZone?: string): string {
  const reset = new Date(resetAt);
  if (Number.isNaN(reset.getTime())) return "demain";
  const day = (date: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(reset);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const when = day(reset) === day(now) ? "aujourd'hui" : "demain";
  return `${when} à ${hour} h ${minute}`;
}
