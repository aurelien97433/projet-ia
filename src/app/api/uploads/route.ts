import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/require-user";
import { createUpload } from "@/server/documents/create-upload";

const NO_STORE = { "Cache-Control": "no-store" };

// Demande de dépôt d'un fichier (story 2.6a, AD-7) : le proxy laisse passer /api/, cette route vérifie
// elle-même la session. Elle ne reçoit jamais le fichier : seulement son nom et sa taille, puis
// renvoie l'upload_id et l'URL signée vers {author_id}/uploads/{upload_id}.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: 401, headers: NO_STORE });

  const result = await createUpload(await request.json().catch(() => undefined), auth.user.id, await createClient());
  if (result.status === "created") {
    return NextResponse.json({ uploadId: result.uploadId, signedUrl: result.signedUrl }, { headers: NO_STORE });
  }
  return NextResponse.json({ error: result.error }, { status: result.status === "invalid" ? 400 : 500, headers: NO_STORE });
}
