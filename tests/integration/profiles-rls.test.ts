import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Tests sur Supabase local (npx supabase start) : déclencheur profiles, rôle anon, RLS à deux Comptes.
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };

let anon: SupabaseClient;
let admin: SupabaseClient;
const created: string[] = [];

async function signUpUser(prefix: string) {
  const email = uniqueEmail(prefix);
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  created.push(data.user.id);
  return { client, email, id: data.user.id, session: data.session };
}

let a: Awaited<ReturnType<typeof signUpUser>>;
let b: Awaited<ReturnType<typeof signUpUser>>;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  anon = createClient(url, publishableKey, options);
  admin = createClient(url, serviceRoleKey, options);
  a = await signUpUser("camille");
  b = await signUpUser("lucas");
}, 60_000);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("création de Compte (FR-1)", () => {
  it("ouvre une session sans confirmation par e-mail", () => {
    expect(a.session).not.toBeNull();
  });

  it("crée la ligne profiles par déclencheur, display_name = partie locale de l'e-mail", async () => {
    const { data, error } = await admin.from("profiles").select("id, email, display_name").eq("id", a.id).single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: a.id, email: a.email, display_name: a.email.split("@")[0] });
  });

  it("refuse un e-mail déjà utilisé avec le code user_already_exists, sans créer de Compte", async () => {
    const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
    const { data, error } = await client.auth.signUp({ email: a.email, password: PASSWORD });
    expect(error?.code).toBe("user_already_exists");
    expect(data.user).toBeNull();
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("email", a.email);
    expect(count).toBe(1);
  });
});

describe("rôle anon (Visiteur)", () => {
  it("ne lit aucun profil", async () => {
    const { data, error } = await anon.from("profiles").select("id");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });

  it("ne peut rien écrire (refus de privilège, pas une collision de clé)", async () => {
    const { error } = await anon
      .from("profiles")
      .insert({ id: crypto.randomUUID(), email: "x@y.test", display_name: "x" });
    expect(error?.code).toBe("42501");
  });
});

describe("privilèges SQL (rôle anon, fonctions)", () => {
  it("anon n'exécute pas la fonction du déclencheur", () => {
    const rows = localSqlRows(
      "select has_function_privilege('anon', 'public.handle_new_user()', 'execute') as anon_exec",
    );
    expect(rows[0]?.anon_exec).toBe(false);
  });

  it("une fonction créée après la migration n'est pas exécutable par anon", () => {
    localSqlRows("create or replace function public.zz_probe_privileges() returns int language sql as 'select 1'");
    try {
      const rows = localSqlRows(
        "select has_function_privilege('anon', 'public.zz_probe_privileges()', 'execute') as anon_exec",
      );
      expect(rows[0]?.anon_exec).toBe(false);
    } finally {
      localSqlRows("drop function if exists public.zz_probe_privileges()");
    }
  });

  it("anon n'a aucun privilège sur la table profiles", () => {
    const rows = localSqlRows(
      "select has_table_privilege('anon', 'public.profiles', 'select,insert,update,delete') as anon_any",
    );
    expect(rows[0]?.anon_any).toBe(false);
  });
});

describe("RLS à deux Comptes", () => {
  it("B lit le profil de A", async () => {
    const { data, error } = await b.client.from("profiles").select("id, display_name").eq("id", a.id).single();
    expect(error).toBeNull();
    expect(data?.id).toBe(a.id);
  });

  it("B ne lit pas l'e-mail de A (colonne non accordée)", async () => {
    const { data, error } = await b.client.from("profiles").select("email").eq("id", a.id);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("B ne peut ni modifier ni supprimer le profil de A, ni en insérer un", async () => {
    const update = await b.client.from("profiles").update({ display_name: "pirate" }).eq("id", a.id);
    const remove = await b.client.from("profiles").delete().eq("id", a.id);
    const insert = await b.client.from("profiles").insert({ id: b.id, email: b.email, display_name: "doublon" });
    expect(update.error?.code).toBe("42501");
    expect(remove.error?.code).toBe("42501");
    expect(insert.error?.code).toBe("42501");
  });

  it("A ne peut pas modifier son propre profil depuis l'application", async () => {
    const { error } = await a.client.from("profiles").update({ display_name: "autre" }).eq("id", a.id);
    expect(error?.code).toBe("42501");
  });

  it("le profil de A est resté intact", async () => {
    const { data } = await admin.from("profiles").select("display_name").eq("id", a.id).single();
    expect(data?.display_name).toBe(a.email.split("@")[0]);
  });
});
