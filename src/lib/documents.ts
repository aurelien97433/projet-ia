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
export type DocumentErrorKind = "temporary" | "no_text";

// 100 Ko = 100 000 octets UTF-8, même définition dans tous les contrôles (décision du 2026-11-12, story 2.7 :
// au-delà, l'écriture finale des Passages dépasse la limite de 8 s par instruction de l'API ; mesures dans
// docs/mesures/charge-100000-octets.md). Fichiers .txt et .md, et texte des Notes après normalisation.
export const MAX_TEXT_BYTES = 100_000;
export const MAX_TITLE_LENGTH = 200;

export const utf8Length = (value: string) => new TextEncoder().encode(value).length;

// Texte canonique (AD-8) : fins de ligne « \n », forme NFC. Mesures, stockage et positions des
// Passages portent tous sur cette forme.
export const canonicalText = (value: string) => value.replace(/\r\n?/g, "\n").normalize("NFC");
