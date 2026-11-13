import { z } from "zod";
import { DOCUMENT_CATEGORIES, MAX_TEXT_BYTES, MAX_TITLE_LENGTH, canonicalText, utf8Length } from "@/lib/documents";
import { texts } from "@/lib/texts";

const errors = texts.addDocument.errors;

// Création d'une Note (FR-4) : titre de 1 à 200 caractères, Catégorie de la liste, texte non vide de
// 100 000 octets UTF-8 au plus (100 Ko, mesurés après normalisation), identifiant de demande (AD-16).
// Mêmes règles que la base.
export const noteSchema = z.object({
  title: z
    .string({ error: errors.titleMissing })
    .trim()
    .min(1, { error: errors.titleMissing })
    .max(MAX_TITLE_LENGTH, { error: errors.titleTooLong }),
  category: z.enum(DOCUMENT_CATEGORIES, { error: errors.categoryMissing }),
  // Texte canonique (AD-8) avant toute mesure : fins de ligne « \n » et forme NFC. L'envoi d'un
  // formulaire convertit chaque « \n » en « \r\n » : sans cette étape, le serveur compterait plus
  // d'octets que le navigateur et refuserait une Note pourtant à la limite.
  content: z
    .string({ error: errors.textMissing })
    .transform(canonicalText)
    .refine((value) => value.trim() !== "", { error: errors.textMissing })
    .refine((value) => utf8Length(value) <= MAX_TEXT_BYTES, { error: errors.textTooLarge }),
  clientRequestId: z.uuid(),
});

export type NoteInput = z.infer<typeof noteSchema>;
