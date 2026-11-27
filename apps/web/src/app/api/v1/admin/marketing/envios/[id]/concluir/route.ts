import { fail, marketingGuard, UUID } from "@/server/marketing/api";
import { finalizeUpload } from "@/server/marketing/media";

/** Passo 3 do envio: confere o conteúdo (tipo real, medidas, duração) e libera o arquivo. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await marketingGuard(request, "marketing:manage");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail("Envio inválido.", 404);
  const r = await finalizeUpload(auth.user.id, id);
  return r.ok ? Response.json(r) : fail(r.message, 422);
}
