"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/forms/error-alert";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextAreaField } from "@/components/forms/text-area-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DOCUMENT_CATEGORIES } from "@/lib/documents";
import { noteSchema } from "@/lib/schemas/documents";
import { texts } from "@/lib/texts";
import type { CreateNoteResult, NoteFieldErrors } from "@/server/documents/create-note";
import { createNoteAction } from "./actions";

const t = texts.addDocument;
const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: texts.categories[value] }));
// Au-delà, l'envoi est considéré comme perdu : formulaire déverrouillé, « Réessayer » (EXPERIENCE.md, E8).
const SAVE_TIMEOUT_MS = 10_000;
const FIELDS = ["title", "category", "content"] as const;

// Validation locale avant tout envoi : même schéma que le serveur, sans l'identifiant de demande.
const localSchema = noteSchema.omit({ clientRequestId: true });

type Alert = { message: string; retryable: boolean } | null;

// Onglet Note de E8. Envoi par onSubmit + transition (saisie conservée), verrou synchrone contre le
// double clic. L'identifiant de demande est créé au premier envoi et réutilisé par « Réessayer » :
// le serveur ne crée jamais deux Documents pour la même saisie (AD-16).
export function NoteForm() {
  const router = useRouter();
  const [values, setValues] = useState({ title: "", category: "", content: "" });
  const [fieldErrors, setFieldErrors] = useState<NoteFieldErrors>({});
  const [alert, setAlert] = useState<Alert>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const busy = isPending && !timedOut;
  const hasInput = values.title !== "" || values.category !== "" || values.content !== "";

  useEffect(() => {
    if (alert) alertRef.current?.focus();
  }, [alert]);

  function focusFirstError(errors: NoteFieldErrors) {
    const first = FIELDS.find((field) => errors[field]);
    ({ title: titleRef, category: categoryRef, content: contentRef })[first ?? "title"].current?.focus();
  }

  function showResult(result: CreateNoteResult) {
    if (result.status === "invalid") {
      setFieldErrors(result.fieldErrors);
      focusFirstError(result.fieldErrors);
    } else if (result.status === "error") {
      setAlert({ message: result.error.message, retryable: result.error.retryable });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy) return;

    const local = localSchema.safeParse(values);
    if (!local.success) {
      const errors: NoteFieldErrors = {};
      for (const issue of local.error.issues) {
        const field = issue.path[0] as keyof NoteFieldErrors;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }

    submitting.current = true;
    setFieldErrors({});
    setAlert(null);
    setTimedOut(false);
    requestId.current ??= crypto.randomUUID();
    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("category", values.category);
    formData.set("content", values.content);
    formData.set("clientRequestId", requestId.current);

    const timer = setTimeout(() => {
      submitting.current = false;
      setTimedOut(true);
      setAlert({ message: t.errors.saveFailed, retryable: true });
    }, SAVE_TIMEOUT_MS);

    startTransition(async () => {
      try {
        // En cas de succès, la Server Action redirige vers la page du Document.
        showResult(await createNoteAction(formData));
      } catch (error) {
        unstable_rethrow(error);
        setAlert({ message: t.errors.saveFailed, retryable: true });
      } finally {
        clearTimeout(timer);
        submitting.current = false;
      }
    });
  }

  function leave() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form ref={formRef} method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <FormField
        id="title"
        label={t.titleLabel}
        required
        error={fieldErrors.title}
        inputProps={{ ref: titleRef, name: "title", value: values.title, onChange: set("title"), autoFocus: true }}
      />
      <SelectField
        id="category"
        label={t.categoryLabel}
        required
        error={fieldErrors.category}
        placeholder={t.categoryPlaceholder}
        options={CATEGORY_OPTIONS}
        selectProps={{ ref: categoryRef, name: "category", value: values.category, onChange: set("category") }}
      />
      <TextAreaField
        id="content"
        label={t.textLabel}
        required
        error={fieldErrors.content}
        textareaProps={{ ref: contentRef, name: "content", value: values.content, onChange: set("content") }}
      />

      {alert ? (
        <ErrorAlert
          ref={alertRef}
          title={alert.message}
          action={
            alert.retryable ? (
              <Button type="button" variant="outline" onClick={() => formRef.current?.requestSubmit()}>
                {t.retry}
              </Button>
            ) : null
          }
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
        <div className="sm:w-48">
          <SubmitButton busy={busy} label={t.submit} busyLabel={t.submitting} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 sm:w-32"
          onClick={() => (hasInput ? setConfirmAbandon(true) : leave())}
        >
          {t.cancel}
        </Button>
      </div>

      <AlertDialog open={confirmAbandon} onOpenChange={setConfirmAbandon}>
        <AlertDialogContent>
          <AlertDialogTitle>{t.abandon.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.abandon.text}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.abandon.keep}</AlertDialogCancel>
            <AlertDialogAction onClick={leave}>{t.abandon.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
