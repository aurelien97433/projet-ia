import { fileExtension, mimeForExtension } from "@/lib/files";

// Dépôt d'un fichier dans le Storage privé (AD-7, étape 2), depuis le navigateur : demande d'une URL
// signée à Next.js (POST /api/uploads), puis PUT direct sur cette URL. Le fichier ne transite jamais
// par Next.js. Fonctions sans React, testées à part.

export type UploadOutcome =
  | { status: "uploaded"; uploadId: string }
  | { status: "rejected"; reason: "format" | "size" }
  | { status: "unauthenticated" }
  | { status: "failed" }
  | { status: "aborted" };

// Au-delà, le dépôt est considéré comme échoué (1 Mo au plus).
export const UPLOAD_TIMEOUT_MS = 60_000;

type UploadTarget = { uploadId: string; signedUrl: string };

async function requestUpload(file: File, signal: AbortSignal): Promise<UploadTarget | UploadOutcome> {
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
    cache: "no-store",
    // Demande sans réponse : échec au bout du même délai que le dépôt, jamais d'attente sans fin.
    signal: AbortSignal.any([signal, AbortSignal.timeout(UPLOAD_TIMEOUT_MS)]),
  });
  if (response.status === 401) return { status: "unauthenticated" };
  const body = (await response.json().catch(() => null)) as
    | { uploadId?: unknown; signedUrl?: unknown; error?: { code?: unknown } }
    | null;
  if (response.status === 400) {
    if (body?.error?.code === "FILE_TOO_LARGE") return { status: "rejected", reason: "size" };
    if (body?.error?.code === "FILE_TYPE_UNSUPPORTED") return { status: "rejected", reason: "format" };
  }
  if (!response.ok || typeof body?.uploadId !== "string" || typeof body.signedUrl !== "string") return { status: "failed" };
  return { uploadId: body.uploadId, signedUrl: body.signedUrl };
}

// PUT du fichier avec progression (XMLHttpRequest : fetch ne rapporte pas l'avancement d'un envoi).
// Type déduit de l'extension, jamais du navigateur ; jamais d'écrasement (x-upsert: false).
function putFile(target: UploadTarget, file: File, onProgress: (ratio: number) => void, signal: AbortSignal) {
  return new Promise<"ok" | "failed" | "aborted">((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", target.signedUrl);
    request.timeout = UPLOAD_TIMEOUT_MS;
    request.setRequestHeader("x-upsert", "false");
    request.setRequestHeader("Content-Type", mimeForExtension(fileExtension(file.name) ?? "txt"));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    const abort = () => request.abort();
    const finish = (result: "ok" | "failed" | "aborted") => {
      signal.removeEventListener("abort", abort);
      resolve(result);
    };
    request.onload = () => finish(request.status >= 200 && request.status < 300 ? "ok" : "failed");
    request.onerror = () => finish("failed");
    request.ontimeout = () => finish("failed");
    request.onabort = () => finish("aborted");
    signal.addEventListener("abort", abort, { once: true });
    request.send(file);
  });
}

export async function uploadFile(file: File, onProgress: (ratio: number) => void, signal: AbortSignal): Promise<UploadOutcome> {
  try {
    const target = await requestUpload(file, signal);
    if ("status" in target) return target;
    if (signal.aborted) return { status: "aborted" };
    const result = await putFile(target, file, onProgress, signal);
    if (result === "ok") return { status: "uploaded", uploadId: target.uploadId };
    return { status: result };
  } catch {
    return signal.aborted ? { status: "aborted" } : { status: "failed" };
  }
}
