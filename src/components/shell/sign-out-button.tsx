"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import { signOutAction } from "@/server/auth/sign-out";

function SubmitSignOut() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      aria-disabled={pending || undefined}
      // Un second clic pendant l'envoi est ignoré (aria-disabled, jamais disabled).
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      className="min-h-10 w-full justify-start px-3"
    >
      {pending ? texts.shell.signingOut : texts.shell.signOut}
    </Button>
  );
}

// « Se déconnecter » (FR-2) : Server Action, puis retour sur la Connexion avec « Vous êtes déconnecté. ».
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SubmitSignOut />
    </form>
  );
}
