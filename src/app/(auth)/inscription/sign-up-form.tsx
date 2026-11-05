"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/forms/error-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { texts } from "@/lib/texts";
import type { SignUpResult } from "@/server/auth/sign-up";
import { signUpAction } from "./actions";

const SIGN_IN_HREF = "/connexion";

// Formulaire de création de Compte (E2). Envoi par onSubmit + transition plutôt que par l'attribut
// action : React réinitialiserait sinon le formulaire, et la saisie ne serait pas conservée.
export function SignUpForm() {
  const [result, setResult] = useState<SignUpResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  // Garde synchrone : un second clic arrive avant que l'état « occupé » ne soit rendu.
  const submitting = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const fieldErrors = result?.status === "invalid" ? result.fieldErrors : {};
  const emailTaken = result?.status === "invalid" && result.emailTaken === true;

  // Après un envoi refusé : focus sur le premier champ en erreur, sinon sur l'alerte.
  useEffect(() => {
    if (!result) return;
    if (result.status === "invalid") {
      (result.fieldErrors.email ? emailRef : passwordRef).current?.focus();
    } else if (result.status === "error") {
      alertRef.current?.focus();
    } else if (result.status === "confirmation_required") {
      noticeRef.current?.focus();
    }
  }, [result]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // isPending couvre l'intervalle où l'appel est terminé mais le bouton encore « occupé ».
    if (submitting.current || isPending) return;
    submitting.current = true;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        // En cas de succès, la Server Action redirige vers le Tableau de bord.
        setResult(await signUpAction(formData));
      } catch (error) {
        // Laisse remonter les exceptions internes de Next.js (redirection), traite le reste
        // (réseau coupé, serveur injoignable) comme une erreur inattendue.
        unstable_rethrow(error);
        setResult({
          status: "error",
          error: { code: "INTERNAL", message: texts.signUp.errors.unexpectedTitle, retryable: true },
        });
      } finally {
        submitting.current = false;
      }
    });
  }

  const busy = isPending;

  return (
    <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-xs font-medium text-muted-foreground">{texts.common.requiredLegend}</p>

      {result?.status === "error" ? (
        <ErrorAlert ref={alertRef} title={result.error.message}>
          <p>{texts.signUp.errors.unexpectedText}</p>
        </ErrorAlert>
      ) : null}

      {result?.status === "confirmation_required" ? (
        // Information neutre (DESIGN.md : pas de rouge pour ce qui n'est pas une panne).
        <div
          ref={noticeRef}
          role="status"
          tabIndex={-1}
          className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground"
        >
          <p className="font-semibold">{texts.signUp.confirmationRequired.title}</p>
          <p className="mt-1">{texts.signUp.confirmationRequired.text}</p>
        </div>
      ) : null}

      <FormField
        id="email"
        label={texts.auth.emailLabel}
        required
        error={fieldErrors.email}
        errorAction={
          emailTaken ? (
            <Link href={SIGN_IN_HREF} className="font-medium text-primary underline underline-offset-4">
              {texts.auth.signInLink}
            </Link>
          ) : null
        }
        inputProps={{
          ref: emailRef,
          name: "email",
          type: "email",
          inputMode: "email",
          autoComplete: "email",
          autoFocus: true,
        }}
      />

      <FormField
        id="password"
        label={texts.auth.passwordLabel}
        required
        help={texts.signUp.passwordHelp}
        error={fieldErrors.password}
        trailing={
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0"
            aria-controls="password"
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? texts.auth.hidePassword : texts.auth.showPassword}
          </Button>
        }
        inputProps={{
          ref: passwordRef,
          name: "password",
          type: showPassword ? "text" : "password",
          autoComplete: "new-password",
        }}
      />

      <SubmitButton busy={busy} label={texts.signUp.submit} busyLabel={texts.signUp.submitting} />

      <p className="text-center text-sm">
        <Link href={SIGN_IN_HREF} className="font-medium text-primary underline underline-offset-4">
          {texts.signUp.alreadyHaveAccount}
        </Link>
      </p>
    </form>
  );
}
