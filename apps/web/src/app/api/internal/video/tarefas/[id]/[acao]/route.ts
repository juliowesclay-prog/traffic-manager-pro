import {
  completeEdit,
  receiveAudio,
  reportFailure,
  reportProgress,
  workerAuthorized,
  workerFile,
} from "@/server/marketing/video";

/**
 * Rotas do servidor de vídeo para UMA tarefa (só a que ele reservou):
 * GET origem|logo (modo local) · POST progresso | falhou | audio | concluir.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string; acao: string }> };
const MAX_AUDIO = 4 * 1024 * 1024;

export async function GET(request: Request, { params }: Params) {
  const worker = workerAuthorized(request);
  if (!worker) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  const { id, acao } = await params;
  const assetId = new URL(request.url).searchParams.get("arquivo") ?? "";
  if (!UUID.test(id) || !UUID.test(assetId) || (acao !== "origem" && acao !== "logo"))
    return new Response(null, { status: 404 });
  const f = await workerFile(id, worker, acao, assetId);
  if (!f) return new Response(null, { status: 404 });
  return new Response(f.stream, {
    headers: { "Content-Type": f.mime, "Content-Length": String(f.size), "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request, { params }: Params) {
  const worker = workerAuthorized(request);
  if (!worker) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  const { id, acao } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  if (acao === "progresso") {
    const body = (await request.json().catch(() => ({}))) as { progresso?: number };
    const ok = await reportProgress(id, worker, Number(body.progresso) || 0);
    return Response.json({ ok }, { status: ok ? 200 : 409 });
  }
  if (acao === "falhou") {
    const body = (await request.json().catch(() => ({}))) as { erro?: string };
    const ok = await reportFailure(id, worker, String(body.erro ?? "erro desconhecido").slice(0, 300));
    return Response.json({ ok: !!ok }, { status: ok ? 200 : 409 });
  }
  if (acao === "audio") {
    const size = Number(request.headers.get("content-length"));
    if (!size || size > MAX_AUDIO)
      return Response.json({ ok: false, message: "Áudio grande demais." }, { status: 413 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_AUDIO) return Response.json({ ok: false }, { status: 413 });
    const r = await receiveAudio(id, worker, bytes);
    return r ? Response.json(r) : Response.json({ ok: false }, { status: 409 });
  }
  if (acao === "concluir") {
    const r = await completeEdit(id, worker);
    return r ? Response.json(r) : Response.json({ ok: false }, { status: 409 });
  }
  return new Response(null, { status: 404 });
}
