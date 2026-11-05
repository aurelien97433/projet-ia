import type { Metadata } from "next";
import { texts } from "@/lib/texts";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: `${texts.signIn.pageTitle} · ${texts.app.name}`,
};

// E1 · Connexion (FR-2).
export default function SignInPage() {
  return (
    <>
      <h1 className="text-xl leading-tight font-[650] text-foreground">{texts.signIn.pageTitle}</h1>
      <SignInForm />
    </>
  );
}
