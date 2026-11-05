import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { localSqlRows, localSupabase } from "../support/local-supabase";

// Appel direct de l'API Supabase par un Visiteur, avec la seule clé publique (FR-2, NFR-1) : pour
// chaque table et vue de public, aucune donnée (résultat vide ou refus). Le même contrôle sur les
// Route Handlers est rejoué en story 7.3, quand ils existeront.
const options = { auth: { persistSession: false, autoRefreshToken: false } };

const relations = localSqlRows(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
).map((row) => String(row.table_name));

describe("Visiteur : appel direct avec la clé publique", () => {
  it("la liste des tables de public est connue (profiles au moins)", () => {
    expect(relations).toContain("profiles");
  });

  it.each(relations)("lecture de %s : aucune ligne", async (table) => {
    const anon = createClient(localSupabase().url, localSupabase().publishableKey, options);
    const { data, error } = await anon.from(table).select("*").limit(1);
    if (error) {
      // Refus par privilège (42501) plutôt qu'une table vide : c'est le cas attendu après le REVOKE.
      expect(error.code).toBe("42501");
    } else {
      expect(data).toEqual([]);
    }
  });

  it("profiles contient des lignes, mais aucune n'est visible du Visiteur", async () => {
    const admin = createClient(localSupabase().url, localSupabase().serviceRoleKey, options);
    const anon = createClient(localSupabase().url, localSupabase().publishableKey, options);
    // Garantit que le test ne passe pas simplement parce que la table est vide.
    const { data: users, error: creationError } = await admin.auth.admin.createUser({
      email: `anon-acces-${Date.now()}@exemple.test`,
      password: ["Mot", "de", "passe", "anon", "2026"].join("-"),
      email_confirm: true,
    });
    expect(creationError).toBeNull();
    try {
      const { data: own } = await admin.from("profiles").select("id").eq("id", users.user!.id);
      expect(own).toHaveLength(1);
      const { data, error } = await anon.from("profiles").select("id");
      expect(error?.code === "42501" || (data ?? []).length === 0).toBe(true);
    } finally {
      if (users.user) await admin.auth.admin.deleteUser(users.user.id);
    }
  });
});
