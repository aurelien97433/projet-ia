import { z } from "zod";
import { texts } from "@/lib/texts";

export const PASSWORD_MIN_LENGTH = 8;
// Limite de Supabase Auth (bcrypt), comptée en octets UTF-8 : un caractère accentué en compte deux.
export const PASSWORD_MAX_BYTES = 72;

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

// Création de Compte (FR-1) : e-mail valide, mot de passe de 8 caractères au moins et de 72 au plus.
export const signUpSchema = z.object({
  email: z
    .string({ error: texts.signUp.errors.invalidEmail })
    .trim()
    .pipe(z.email({ error: texts.signUp.errors.invalidEmail })),
  password: z
    .string({ error: texts.signUp.errors.passwordTooShort })
    .min(PASSWORD_MIN_LENGTH, { error: texts.signUp.errors.passwordTooShort })
    .refine((value) => utf8Length(value) <= PASSWORD_MAX_BYTES, { error: texts.signUp.errors.passwordTooLong }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

// Connexion (FR-2) : un seul message pour toute saisie refusée, sans désigner le champ fautif.
// Aucune règle de longueur minimale : un mot de passe faux ou trop court reçoit le même message.
export const signInSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1).max(1024),
});

export type SignInInput = z.infer<typeof signInSchema>;
