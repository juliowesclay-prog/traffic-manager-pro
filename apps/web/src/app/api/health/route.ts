import { prisma } from "@tmp/db";

export const dynamic = "force-dynamic";

/** Verificação de saúde para monitoramento e para os testes E2E. Não expõe detalhes internos. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  }
}
