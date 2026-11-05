import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { ADD_HREF } from "./nav-items";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import { SessionGate } from "./session-gate";
import { UserEmail, UserEmailFallback } from "./user-email";

export const MAIN_CONTENT_ID = "contenu";

// Coquille des écrans protégés (EXPERIENCE.md, Navigation) : barre latérale fixe à partir de
// 1024 px, barre du haut globale et menu en Sheet en dessous, lien d'évitement en premier arrêt.
export function AppShell({ children }: { children: React.ReactNode }) {
  // E-mail du Collaborateur, lu côté serveur sous Suspense ; transmis au menu mobile (composant client).
  const account = (
    <Suspense fallback={<UserEmailFallback />}>
      <UserEmail />
    </Suspense>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-medium text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {texts.shell.skipLink}
      </a>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-background px-2 lg:hidden">
        <MobileNav account={account} />
        <Logo />
        <Button asChild variant="ghost" size="icon-lg">
          <Link href={ADD_HREF} aria-label={texts.shell.addDocumentLabel}>
            <Plus aria-hidden="true" className="size-5" />
          </Link>
        </Button>
      </header>

      <aside className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col gap-6 border-r bg-surface p-4 lg:flex">
        <Logo />
        <Button asChild className="min-h-10 justify-start">
          <Link href={ADD_HREF}>{texts.shell.addAction}</Link>
        </Button>
        <nav aria-label={texts.shell.navigationLabel}>
          <Suspense fallback={<NavLinks staticRender />}>
            <NavLinks />
          </Suspense>
        </nav>
        <div className="mt-auto border-t pt-3">
          {account}
          <SignOutButton />
        </div>
      </aside>

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 lg:px-6">
        <div className="mx-auto w-full max-w-content">
          <Suspense fallback={null}>
            <SessionGate>{children}</SessionGate>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
