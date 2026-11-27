import { buildZip, safeFileName } from "@tmp/core";
import { prisma } from "@/server/db";
import { marketingGuard, UUID } from "@/server/marketing/api";
import { storage } from "@/server/marketing/storage";

/** Baixa todas as páginas de um carrossel (versão atual ou ?versao=N) num arquivo .zip. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await marketingGuard(request, "marketing:read");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const n = Number(new URL(request.url).searchParams.get("versao"));
  const c = await prisma.creative.findFirst({
    where: { id },
    include: {
      versions: {
        where: Number.isInteger(n) && n > 0 ? { number: n } : {},
        orderBy: { number: "desc" },
        take: 1,
        include: { assets: { where: { status: "PRONTO" }, orderBy: { position: "asc" } } },
      },
    },
  });
  const v = c?.versions[0];
  if (!c || !v || !v.assets.length) return new Response(null, { status: 404 });
  const s = storage();
  const files: { name: string; data: Uint8Array }[] = [];
  for (const [i, a] of v.assets.entries()) {
    const chunks: Uint8Array[] = [];
    const r = s.stream(a.storageKey).getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(value);
    }
    const ext = a.storageKey.split(".").pop() ?? "png";
    files.push({
      name: `${String(i + 1).padStart(2, "0")}-${safeFileName(c.name, ext)}`,
      data: Buffer.concat(chunks),
    });
  }
  const zip = buildZip(files);
  return new Response(zip as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFileName(`${c.name}-v${v.number}`, "zip")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
