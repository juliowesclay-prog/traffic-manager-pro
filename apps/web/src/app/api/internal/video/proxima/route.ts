import { claimJob, workerAuthorized } from "@/server/marketing/video";

/** Servidor de vídeo pede a próxima tarefa. 204 = fila vazia. Protegido por VIDEO_WORKER_SECRET. */
export async function POST(request: Request) {
  const worker = workerAuthorized(request);
  if (!worker) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  const job = await claimJob(worker);
  if (!job) return new Response(null, { status: 204 });
  return Response.json(job);
}
