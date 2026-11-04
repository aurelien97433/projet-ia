import type { Metadata } from "next";
import { texts } from "@/lib/texts";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: `${texts.signUp.pageTitle} · ${texts.app.name}`,
};

// E2 · Création de Compte (FR-1).
export default function SignUpPage() {
  return (
    <>
      <h1 className="text-xl leading-tight font-[650] text-foreground">{texts.signUp.pageTitle}</h1>
      <SignUpForm />
    </>
  );
}
