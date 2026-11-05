// Valeurs partagées des Documents (correspondance Glossaire → code, architecture §6).
export const DOCUMENT_CATEGORIES = [
  "procedure",
  "faq",
  "meeting_note",
  "project_sheet",
  "client_report",
  "business_resource",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type DocumentStatus = "processing" | "ready" | "error";

// 1 Mo = 1 000 000 octets UTF-8, même définition dans tous les contrôles (décision du 2026-11-03).
export const MAX_TEXT_BYTES = 1_000_000;
export const MAX_TITLE_LENGTH = 200;

export const utf8Length = (value: string) => new TextEncoder().encode(value).length;

// Texte canonique (AD-8) : fins de ligne « \n », forme NFC. Mesures, stockage et positions des
// Passages portent tous sur cette forme.
export const canonicalText = (value: string) => value.replace(/\r\n?/g, "\n").normalize("NFC");
