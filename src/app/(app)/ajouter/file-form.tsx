"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/forms/error-alert";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
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
import { checkFile, FILE_ACCEPT, titleFromFileName } from "@/lib/files";
import { importFileSchema } from "@/lib/schemas/uploads";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";
import type { FileFieldErrors, ImportFileResult } from "@/server/documents/import-file";
import { importFileAction } from "./actions";
import { uploadFile } from "./upload-file";

const t = texts.addDocument;
const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: texts.categories[value] }));
// Au-delà, l'import est considéré comme perdu : formulaire déverrouillé, « Réessayer » (EXPERIENCE.md, E8).
const SAVE_TIMEOUT_MS = 10_000;
const FIELDS = ["title", "category", "file"] as const;
const localSchema = importFileSchema.pick({ title: true, category: true });

// État du fichier choisi. Le fichier reste en mémoire pour « Réessayer » (nouveau dépôt).
type Upload =
  | { kind: "none" }
  | { kind: "rejected"; reason: "format" | "size" }
  | { kind: "uploading"; file: File; progress: number }
  | { kind: "failed"; file: File }
  | { kind: "uploaded"; file: File; uploadId: string };

type Alert = { message: string; retryable: boolean } | null;

// Onglet Fichier de E8 (story 2.6a). Dès le choix d'un fichier valide, il est déposé dans le Storage
// privé, avant toute création de Document (AD-7) ; « Importer » est inactif pendant le dépôt. Titre et
// Catégorie ne sont jamais effacés, quel que soit l'échec. L'identifiant de demande est lié au fichier
// déposé : réutilisé par « Réessayer », renouvelé quand le fichier change (AD-16).
export function FileForm() {
  const router = useRouter();
  const [values, setValues] = useState({ title: "", category: "" });
  const [titleTouched, setTitleTouched] = useState(false);
  const [upload, setUpload] = useState<Upload>({ kind: "none" });
  const [fieldErrors, setFieldErrors] = useState<FileFieldErrors>({});
  const [alert, setAlert] = useState<Alert>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);

  const busy = isPending && !timedOut;
  const uploading = upload.kind === "uploading";
  const hasInput = values.title !== "" || values.category !== "" || upload.kind !== "none";

  useEffect(() => {
    if (alert) alertRef.current?.focus();
  }, [alert]);

  // Changement de page pendant un dépôt : il est abandonné.
  useEffect(() => () => uploadController.current?.abort(), []);

  // Fichier lâché à côté de la zone : le navigateur l'ouvrirait à la place de la page, saisie perdue.
  useEffect(() => {
    const block = (event: DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  async function startUpload(file: File) {
    uploadController.current?.abort();
    const controller = new AbortController();
    uploadController.current = controller;
    requestId.current = null;
    setFieldErrors((current) => ({ ...current, file: undefined }));
    setUpload({ kind: "uploading", file, progress: 0 });
    const outcome = await uploadFile(
      file,
      (progress) => {
        if (uploadController.current === controller) setUpload({ kind: "uploading", file, progress });
      },
      controller.signal,
    );
    if (uploadController.current !== controller) return;
    uploadController.current = null;
    if (outcome.status === "uploaded") setUpload({ kind: "uploaded", file, uploadId: outcome.uploadId });
    else if (outcome.status === "rejected") setUpload({ kind: "rejected", reason: outcome.reason });
    else if (outcome.status === "unauthenticated") {
      setUpload({ kind: "failed", file });
      router.refresh();
    } else if (outcome.status === "failed") setUpload({ kind: "failed", file });
  }

  // Choix d'un fichier (sélecteur ou glisser-déposer) : contrôle immédiat, puis dépôt.
  function choose(file: File | undefined) {
    // Import en cours : le fichier ne change pas sous la demande envoyée.
    if (!file || busy) return;
    setFieldErrors((current) => ({ ...current, file: undefined }));
    const rejection = checkFile(file);
    if (rejection) {
      uploadController.current?.abort();
      uploadController.current = null;
      requestId.current = null;
      setUpload({ kind: "rejected", reason: rejection });
      return;
    }
    if (!titleTouched) setValues((current) => ({ ...current, title: titleFromFileName(file.name) }));
    void startUpload(file);
  }

  function focusFirstError(errors: FileFieldErrors) {
    const first = FIELDS.find((field) => errors[field]) ?? "title";
    ({ title: titleRef, category: categoryRef, file: chooseRef })[first].current?.focus();
  }

  function showResult(result: ImportFileResult, sentUploadId: string) {
    if (result.status === "invalid") {
      setFieldErrors(result.fieldErrors);
      // Fichier refusé à l'import (absent, autre dossier, taille) : le dépôt est à refaire, seulement
      // si le fichier affiché est toujours celui de la demande (un autre a pu être choisi depuis).
      if (result.fieldErrors.file) {
        setUpload((current) =>
          current.kind === "uploaded" && current.uploadId === sentUploadId ? { kind: "failed", file: current.file } : current,
        );
      }
      focusFirstError(result.fieldErrors);
    } else if (result.status === "error") {
      setAlert({ message: result.error.message, retryable: result.error.retryable });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || uploading) return;

    const errors: FileFieldErrors = {};
    const local = localSchema.safeParse(values);
    if (!local.success) {
      for (const issue of local.error.issues) {
        const field = issue.path[0] as "title" | "category";
        errors[field] ??= issue.message;
      }
    }
    if (upload.kind !== "uploaded") errors.file = upload.kind === "failed" ? t.errors.uploadFailed : t.errors.fileMissing;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }
    if (upload.kind !== "uploaded") return;

    submitting.current = true;
    setFieldErrors({});
    setAlert(null);
    setTimedOut(false);
    requestId.current ??= crypto.randomUUID();
    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("category", values.category);
    formData.set("uploadId", upload.uploadId);
    formData.set("clientRequestId", requestId.current);

    const timer = setTimeout(() => {
      submitting.current = false;
      setTimedOut(true);
      setAlert({ message: t.errors.saveFailed, retryable: true });
    }, SAVE_TIMEOUT_MS);

    startTransition(async () => {
      try {
        // En cas de succès, la Server Action redirige vers la page du Document.
        showResult(await importFileAction(formData), upload.uploadId);
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

  const fileMessageId = "file-message";
  const fileError =
    fieldErrors.file ??
    (upload.kind === "rejected" ? (upload.reason === "format" ? t.errors.fileFormat : t.errors.fileTooLarge) : undefined) ??
    (upload.kind === "failed" ? t.errors.uploadFailed : undefined);

  return (
    <form ref={formRef} method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div
        role="group"
        aria-labelledby="file-label"
        data-drop-zone
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          // Passage sur un élément enfant : la zone reste survolée.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-w-0 flex-col items-start gap-3 rounded-lg border border-dashed p-4 sm:p-6",
          dragging && "border-primary bg-surface",
          fileError && "border-destructive",
        )}
      >
        <p id="file-label" className="text-sm font-medium text-foreground">
          {t.fileLabel}
          <span aria-hidden="true"> *</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            // Même fichier choisi deux fois de suite : l'événement doit se reproduire.
            event.target.value = "";
          }}
        />
        <Button
          ref={chooseRef}
          type="button"
          variant="outline"
          className="h-10 w-full sm:w-auto"
          aria-describedby={`file-formats ${fileMessageId}`}
          onClick={() => inputRef.current?.click()}
        >
          {t.chooseFile}
        </Button>
        <p id="file-formats" className="text-xs font-medium text-muted-foreground">
          {t.formats}
        </p>

        {/* Zone toujours présente : progression et fin du dépôt annoncées sans déplacer le focus. */}
        <div id={fileMessageId} role="status" className="flex w-full min-w-0 flex-col gap-2 text-sm empty:hidden">
          {upload.kind === "uploading" ? <p className="text-foreground">{t.uploading}</p> : null}
          {upload.kind === "uploaded" && !fieldErrors.file ? (
            <p className="text-foreground [overflow-wrap:anywhere]">{t.uploaded(upload.file.name)}</p>
          ) : null}
          {fileError ? <p className="text-destructive">{fileError}</p> : null}
        </div>
        {/* Hors de la zone vivante : l'avancement n'est pas annoncé à chaque étape, seulement le début et la fin. */}
        {upload.kind === "uploading" ? (
          <progress
            aria-label={t.uploading}
            max={100}
            value={Math.round(upload.progress * 100)}
            className="h-2 w-full accent-primary"
          />
        ) : null}
        {upload.kind === "failed" ? (
          <Button type="button" variant="outline" onClick={() => !busy && void startUpload(upload.file)}>
            {t.retry}
          </Button>
        ) : null}
      </div>

      <FormField
        id="file-title"
        label={t.titleLabel}
        required
        error={fieldErrors.title}
        inputProps={{
          ref: titleRef,
          name: "title",
          value: values.title,
          onChange: (event) => {
            setTitleTouched(true);
            setValues((current) => ({ ...current, title: event.target.value }));
          },
        }}
      />
      <SelectField
        id="file-category"
        label={t.categoryLabel}
        required
        error={fieldErrors.category}
        placeholder={t.categoryPlaceholder}
        options={CATEGORY_OPTIONS}
        selectProps={{
          ref: categoryRef,
          name: "category",
          value: values.category,
          onChange: (event) => setValues((current) => ({ ...current, category: event.target.value })),
        }}
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
          <SubmitButton busy={busy} inactive={uploading} label={t.importSubmit} busyLabel={t.importing} />
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
