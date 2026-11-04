"use client";

import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

// Inactif tant que la session n'est pas branchée (story 1.4) : visible et focalisable au clavier,
// en aria-disabled (jamais disabled, pour ne pas perdre le focus).
export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-disabled="true"
      onClick={(event) => event.preventDefault()}
      className="min-h-10 justify-start px-3 text-muted-foreground aria-disabled:cursor-not-allowed"
    >
      {texts.shell.signOut}
    </Button>
  );
}
