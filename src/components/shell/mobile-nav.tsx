"use client";

import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { texts } from "@/lib/texts";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import { markNavigationFromMobileMenu } from "./title-focus";

// Menu sous 1024 px : la barre latérale devient un Sheet ouvert par ☰. Il se ferme à la navigation,
// par Échap ou par un clic à l'extérieur, et le focus revient sur ☰ (fourni par Radix).
export function MobileNav({ account }: { account: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const handleNavigate = () => {
    markNavigationFromMobileMenu();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" aria-label={texts.shell.openMenu}>
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(18rem,85vw)] gap-0 bg-surface p-4 pt-16" aria-describedby={undefined}>
        <SheetTitle className="sr-only">{texts.shell.menuTitle}</SheetTitle>
        <nav aria-label={texts.shell.navigationLabel}>
          <Suspense fallback={<NavLinks staticRender />}>
            <NavLinks onNavigate={handleNavigate} />
          </Suspense>
        </nav>
        <div className="mt-auto border-t pt-3">
          {account}
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
