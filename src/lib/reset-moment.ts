// Moment du rétablissement du quota (EXPERIENCE.md, « Format de {moment} ») : « aujourd'hui à {heure} »
// ou « demain à {heure} », dans un fuseau donné. Story 5.10 : calculé dans le navigateur (fuseau du
// navigateur, sans « (UTC) ») à partir de resetAt, par la page de l'Assistant. Côté serveur, le fuseau
// est inconnu : le relais de chat garde un texte de repli en UTC, en le précisant.
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
