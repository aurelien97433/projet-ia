import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessRedirect } from "@/lib/auth/routes";

// Rafraîchit la session Supabase à chaque requête, synchronise les cookies et protège les routes :
// sans session, seules /connexion et /inscription sont accessibles (FR-2). Première barrière
// seulement : la coquille revérifie la session, et la RLS protège les données (AD-2).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let authHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // En-têtes anti-cache fournis avec les cookies de session : une réponse qui pose une
          // session ne doit jamais être servie par le CDN à un autre utilisateur.
          authHeaders = headers;
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Ne rien exécuter entre createServerClient et getClaims :
  // cet appel valide le jeton (signature vérifiée) et le rafraîchit si besoin.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // Server Action : jamais redirigée. Une redirection 307 rejouerait le POST sur /connexion et le
  // navigateur recevrait une page au lieu du résultat. Chaque action vérifie la session elle-même
  // (requireUser) et répond UNAUTHENTICATED avec le message de session expirée ; la RLS protège
  // les données.
  if (request.method === "POST" && request.headers.has("next-action")) return response;

  const target = accessRedirect(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  if (!target) return response;

  // La redirection reprend les cookies rafraîchis et leurs en-têtes, sinon la session serait perdue.
  const redirect = NextResponse.redirect(new URL(target, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(authHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
  return redirect;
}
