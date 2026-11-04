import { LayoutDashboard, Library, MessageSquare, Search, type LucideIcon } from "lucide-react";
import { texts } from "@/lib/texts";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Entrées de navigation (EXPERIENCE.md, Navigation) ; « + Ajouter » est une action, pas une entrée.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: texts.nav.dashboard, icon: LayoutDashboard },
  { href: "/assistant", label: texts.nav.assistant, icon: MessageSquare },
  { href: "/recherche", label: texts.nav.search, icon: Search },
  { href: "/bibliotheque", label: texts.nav.library, icon: Library },
];

export const ADD_HREF = "/ajouter";

export function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
