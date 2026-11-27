import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export * from "./crypto";

// Uma única instância por processo (evita esgotar conexões com o hot reload do Next.js em desenvolvimento).
const globalForPrisma = globalThis as unknown as { tmpPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.tmpPrisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.tmpPrisma = prisma;
