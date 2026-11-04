"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

type NavLinksProps = {
  // Appelé au clic sur une entrée (fermeture du menu mobile).
  onNavigate?: () => void;
  // Sans lecture de l'URL : rendu de repli pendant le préchargement (Suspense).
  staticRender?: boolean;
};

function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
                active && "border-primary bg-primary-soft font-semibold text-primary",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveNavList({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

export function NavLinks({ onNavigate, staticRender }: NavLinksProps) {
  return staticRender ? <NavList pathname={null} /> : <ActiveNavList onNavigate={onNavigate} />;
}
