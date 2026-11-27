import "server-only";
import { prisma, type Prisma } from "@tmp/db";
import { clientIp } from "./request";
import { currentCompanyId } from "./tenant";

/**
 * Registra ação relevante na trilha de auditoria (somente inserção). Nunca grave senha, código ou token.
 * A empresa aberta (se houver) é gravada junto, para a auditoria por empresa.
 */
export async function audit(entry: {
  actorId?: string | null;
  companyId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}): Promise<void> {
  const companyId =
    entry.companyId !== undefined ? entry.companyId : await currentCompanyId().catch(() => null);
  await prisma.auditLog.create({ data: { ...entry, companyId, ip: await clientIp() } });
}
