import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@tmp/db";
import { clientIp, userAgent } from "./request";

const isProd = process.env.NODE_ENV === "production";
/** Prefixo __Host- em produção: cookie só HTTPS, sem domínio, caminho "/" (não pode ser plantado por subdomínio). */
export const SESSION_COOKIE = isProd ? "__Host-tmp_sessao" : "tmp_sessao";

export const SESSION_TTL = {
  staff: 12 * 60 * 60 * 1000, // 12 horas no máximo para a equipe
};
/** Equipe: sessão expira após 30 minutos sem uso. */
export const STAFF_IDLE_MS = 30 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export async function createSession(
  userId: string,
  opts: { kind: "staff"; mfaVerified: boolean; activeCompanyId?: string | null },
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL[opts.kind]);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      mfaVerified: opts.mfaVerified,
      activeCompanyId: opts.activeCompanyId ?? null,
      ip: await clientIp(),
      userAgent: await userAgent(),
      expiresAt,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type ActiveSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

async function loadSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  if (Date.now() - session.lastSeenAt.getTime() > STAFF_IDLE_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return null;
  }
  // Atualiza "visto por último" no máximo a cada minuto (evita escrita a cada requisição).
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session;
}

/** Sessão atual (uma consulta por requisição). */
export const currentSession = cache(loadSession);

/** Encerra a sessão atual (sair). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  // Apagar com os MESMOS atributos da criação: o navegador ignora apagar um cookie __Host- sem Secure.
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 0 });
}
