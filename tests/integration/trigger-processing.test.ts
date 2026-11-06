import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { triggerProcessing } from "@/server/documents/trigger-processing";
import { localProcessSecret, localSupabase, uniqueEmail } from "../support/local-supabase";

// triggerProcessing sur Supabase local : un serveur muet simule la fonction arrêtée, et
// abandon_processing s'exécute pour de bon avec le jeton de l'Auteur.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");

let admin: SupabaseClient;
let author: SupabaseClient;
let userId: string;
let silent: Server;
let silentUrl: string;

async function newDocument() {
  const { data, error } = await author
    .from("documents")
    .insert({ title: "Note", category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
    .select("id, attempt_id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data as { id: string; attempt_id: string };
}

const row = async (id: string) =>
  (await admin.from("documents").select("status, error_kind").eq("id", id).single()).data!;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  author = createClient(url, publishableKey, options);
  const { data, error } = await author.auth.signUp({ email: uniqueEmail("declenchement"), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  userId = data.user.id;

  // Accepte la connexion et ne répond jamais.
  silent = createServer(() => {});
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  silentUrl = `http://127.0.0.1:${(silent.address() as AddressInfo).port}/process-document`;
}, 60_000);

afterAll(async () => {
  silent.closeAllConnections();
  silent.close();
  await admin.auth.admin.deleteUser(userId);
});

describe("triggerProcessing", () => {
  it("fonction muette : abandon après 5 s avec le jeton de l'Auteur", async () => {
    const doc = await newDocument();
    const started = Date.now();
    await triggerProcessing(doc.id, doc.attempt_id, author, { url: silentUrl, secret: "secret-de-test" });
    const elapsed = Date.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(4_900);
    expect(elapsed).toBeLessThan(8_000);
    expect(await row(doc.id)).toEqual({ status: "error", error_kind: "temporary" });
  });

  it("mauvais secret sur la vraie fonction : abandon", async () => {
    const doc = await newDocument();
    const url = `${localSupabase().url}/functions/v1/process-document`;
    await triggerProcessing(doc.id, doc.attempt_id, author, { url, secret: "mauvais-secret" });
    expect(await row(doc.id)).toEqual({ status: "error", error_kind: "temporary" });
  });

  it("vraie fonction, bon secret : aucun abandon, le Document devient prêt", async () => {
    const doc = await newDocument();
    const url = `${localSupabase().url}/functions/v1/process-document`;
    await triggerProcessing(doc.id, doc.attempt_id, author, { url, secret: localProcessSecret() });
    await vi.waitFor(async () => expect(await row(doc.id)).toEqual({ status: "ready", error_kind: null }), {
      timeout: 10_000,
      interval: 100,
    });
  });
});
