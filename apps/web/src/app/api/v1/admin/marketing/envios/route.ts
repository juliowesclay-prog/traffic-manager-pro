import { z } from "zod";
import { fail, marketingGuard } from "@/server/marketing/api";
import { createUpload } from "@/server/marketing/media";

const Body = z.object({
  name: z.string().max(300),
  type: z.string().max(100),
  size: z.number().int().positive(),
  purpose: z.enum(["criativo", "logo"]),
});

/** Passo 1 do envio: reserva o arquivo e devolve para onde enviar os bytes. */
export async function POST(request: Request) {
  const auth = await marketingGuard(request, "marketing:manage");
  if (auth instanceof Response) return auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Dados do envio inválidos.");
  const r = await createUpload(auth.user.id, parsed.data);
  return r.ok ? Response.json(r) : fail(r.message);
}
