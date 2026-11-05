import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shell/logo";
import { PageTitle } from "@/components/shell/page-title";
import { texts } from "@/lib/texts";

export const metadata: Metadata = {
  title: `${texts.notFound.title} · ${texts.app.name}`,
};

// E9 · Accès refusé / introuvable (FR-22) : même page pour une ressource inexistante ou interdite,
// sans barre latérale, focus sur le titre. Toute URL inconnue y aboutit, avec le statut 404.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <header>
          <Logo />
        </header>
        <main id="contenu" className="flex flex-col gap-6">
          <PageTitle focusOnLoad>{texts.notFound.title}</PageTitle>
          <p className="text-[15px] text-foreground">{texts.notFound.text}</p>
          <div className="flex flex-col gap-3">
            <Button asChild className="h-10">
              <Link href="/">{texts.notFound.backToDashboard}</Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link href="/assistant">{texts.notFound.openAssistant}</Link>
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
