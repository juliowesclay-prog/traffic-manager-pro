import { safeFileName } from "@tmp/core";
import { prisma } from "@/server/db";
import { fail, marketingGuard, UUID } from "@/server/marketing/api";
import { receiveUpload } from "@/server/marketing/media";
import { storage } from "@/server/marketing/storage";

/**
 * Arquivos do Marketing. Nunca públicos: só com login, permissão e da empresa aberta.
 * GET entrega o arquivo (com trechos "Range" para o vídeo tocar e avançar); ?baixar=1 força o download.
 * PUT recebe os bytes de um envio (passo 2, armazenamento local).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await marketingGuard(request, "marketing:read");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, status: "PRONTO" },
    include: {
      version: { select: { number: true, creative: { select: { name: true } } } },
      brandLogoOf: { select: { name: true } },
    },
  });
  if (!asset || !asset.mimeType || asset.sizeBytes == null) return new Response(null, { status: 404 });

  const size = Number(asset.sizeBytes);
  const ext = asset.storageKey.split(".").pop() ?? "bin";
  const base = asset.version
    ? `${asset.version.creative.name}-v${asset.version.number}${asset.position ? `-${asset.position + 1}` : ""}`
    : `logo-${asset.brandLogoOf?.name ?? "marca"}`;
  const filename = safeFileName(base, ext);
  const download = new URL(request.url).searchParams.get("baixar") === "1";
  const headers: Record<string, string> = {
    "Content-Type": asset.mimeType,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    ETag: `"${asset.sha256}"`,
  };

  // R2: o navegador busca direto no armazenamento, por link assinado que vale 10 minutos.
  const s = storage();
  if (s.presignGet) {
    const url = await s.presignGet(asset.storageKey, {
      expiresSeconds: 600,
      filename,
      contentType: asset.mimeType,
      download,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  }

  const range = request.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    start = Math.max(0, start);
    return new Response(s.stream(asset.storageKey, { start, end }), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(s.stream(asset.storageKey), {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await marketingGuard(request, "marketing:manage");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail("Envio inválido.", 404);
  const r = await receiveUpload(auth.user.id, id, request.body);
  return r.ok ? Response.json(r) : fail(r.message, 413);
}
