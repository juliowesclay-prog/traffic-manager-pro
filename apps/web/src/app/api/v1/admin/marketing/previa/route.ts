import { rateLimit } from "@/server/rate-limit";
import { fail, marketingGuard } from "@/server/marketing/api";
import { previewArt, previewCarouselPage } from "@/server/marketing/studio";

/**
 * Prévia ao vivo da arte ou de uma página do carrossel (PNG desenhado no servidor, nada é gravado).
 * Corpo: { tipo: "arte" | "carrossel", spec, pagina? }.
 */
export async function POST(request: Request) {
  const auth = await marketingGuard(request, "marketing:manage");
  if (auth instanceof Response) return auth;
  if (!(await rateLimit(`mkt-previa:${auth.user.id}`, 400, 10 * 60)))
    return fail("Muitas prévias seguidas. Aguarde.", 429);
  let body: { tipo?: string; spec?: Record<string, unknown>; pagina?: number };
  try {
    body = await request.json();
  } catch {
    return fail("Pedido inválido.");
  }
  if (!body.spec || typeof body.spec !== "object") return fail("Pedido inválido.");
  const r =
    body.tipo === "carrossel"
      ? await previewCarouselPage(body.spec, Number(body.pagina ?? 0) || 0)
      : await previewArt(body.spec);
  if (!r.ok) return fail(r.message, 422);
  return new Response(r.png as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
