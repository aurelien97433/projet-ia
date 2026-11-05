"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/forms/error-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { SIGNED_OUT_PARAM, SIGN_UP_PATH } from "@/lib/auth/routes";
import { NEXT_PARAM } from "@/lib/auth/safe-redirect";
import { texts } from "@/lib/texts";
import type { SignInResult } from "@/server/auth/sign-in";
import { signInAction } from "./actions";

// Échec de l'appel lui-même (réseau coupé, serveur injoignable) : distinct d'une erreur renvoyée.
type FormState = SignInResult | { status: "network" };

// Page demandée avant la connexion, transmise telle quelle : le serveur la filtre (safeNextPath).
function NextPathInput() {
  const next = useSearchParams().get(NEXT_PARAM);
  return next ? <input type="hidden" name={NEXT_PARAM} value={next} /> : null;
}

function SignedOutNotice() {
  if (useSearchParams().get(SIGNED_OUT_PARAM) !== "1") return null;
  return (
    <div role="status" className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground">
      {texts.signIn.signedOut}
    </div>
  );
}

// Formulaire de connexion (E1). Même mécanique que l'inscription : envoi par onSubmit + transition
// (saisie conservée), verrou synchrone contre le double clic. L'erreur d'identifiants ne désigne
// aucun champ : un seul message au-dessus du formulaire, qui reçoit le focus.
export function SignInForm() {
  const [result, setResult] = useState<FormState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && result.status !== "success") alertRef.current?.focus();
  }, [result]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || isPending) return;
    submitting.current = true;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        // En cas de succès, la Server Action redirige vers la page demandée.
        setResult(await signInAction(formData));
      } catch (error) {
        unstable_rethrow(error);
        setResult({ status: "network" });
      } finally {
        submitting.current = false;
      }
    });
  }

  let alert: React.ReactNode = null;
  if (result?.status === "invalid_credentials") {
    alert = <ErrorAlert ref={alertRef} title={texts.signIn.errors.invalidCredentials} />;
  } else if (result?.status === "error") {
    alert = <ErrorAlert ref={alertRef} title={result.error.message} />;
  } else if (result?.status === "network") {
    alert = (
      <ErrorAlert
        ref={alertRef}
        title={texts.signIn.errors.networkLost}
        action={
          <Button type="button" variant="outline" onClick={() => formRef.current?.requestSubmit()}>
            {texts.signIn.retry}
          </Button>
        }
      />
    );
  }

  return (
    // method="post" : un envoi avant le chargement du JavaScript ne place jamais le mot de passe dans l'URL.
    <form ref={formRef} method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {/* Après une tentative, seul le résultat de celle-ci est affiché. */}
        {result ? null : <SignedOutNotice />}
        <NextPathInput />
      </Suspense>

      <p className="text-xs font-medium text-muted-foreground">{texts.common.requiredLegend}</p>

      {alert}

      <FormField
        id="email"
        label={texts.auth.emailLabel}
        required
        inputProps={{
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
          name: "password",
          type: showPassword ? "text" : "password",
          autoComplete: "current-password",
        }}
      />

      <SubmitButton busy={isPending} label={texts.signIn.submit} busyLabel={texts.signIn.submitting} />

      <p className="text-center text-sm">
        <Link href={SIGN_UP_PATH} className="font-medium text-primary underline underline-offset-4">
          {texts.signIn.createAccount}
        </Link>
      </p>
    </form>
  );
}
