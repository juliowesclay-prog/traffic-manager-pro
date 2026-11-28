import { workerAuthorized, workerUpload } from "@/server/marketing/video";

/** Modo local: o servidor de vídeo envia aqui o MP4 gerado (no R2 ele envia direto ao armazenamento). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const worker = workerAuthorized(request);
  if (!worker) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  const { id, assetId } = await params;
  if (!UUID.test(id) || !UUID.test(assetId) || !request.body) return new Response(null, { status: 404 });
  const ok = await workerUpload(id, worker, assetId, request.body);
  return Response.json({ ok: !!ok }, { status: ok ? 200 : 409 });
}
