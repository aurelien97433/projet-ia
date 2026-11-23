import { z } from "zod";
import { ERROR_CODES } from "@/lib/errors";

// Résumé d'un Document (story 6.1, AD-18) : 1 à 5 points non vides de 400 caractères (points de code) au
// plus, mêmes bornes que store_summary et summarize.
export const SUMMARY_MAX_POINTS = 5;
export const SUMMARY_POINT_MAX_LENGTH = 400;

const point = z
  .string()
  .refine((value) => value.trim() !== "" && Array.from(value).length <= SUMMARY_POINT_MAX_LENGTH, "point invalide");

export const storedSummarySchema = z.object({
  points: z.array(point).min(1).max(SUMMARY_MAX_POINTS),
  generatedAt: z.iso.datetime({ offset: true }),
  textVersion: z.number().int().min(1),
});
export type StoredSummary = z.infer<typeof storedSummarySchema>;

// Réponse de POST /api/documents/[id]/summary (et de summarize) : generated vaut vrai seulement si cette
// demande a généré et enregistré le Résumé (une unité consommée) ; faux pour un Résumé déjà à jour.
export const summaryResponseSchema = z.object({ summary: storedSummarySchema, generated: z.boolean() });
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;

// Erreur AD-19 lue par la page.
export const summaryErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1),
    retryable: z.boolean(),
    resetAt: z.iso.datetime({ offset: true }).optional(),
  }),
});
