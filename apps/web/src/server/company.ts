import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { API_KEY_PREFIX, isApiKeyFormat, seesAllCompanies, type Role } from "@tmp/core";
import { prisma as base } from "@tmp/db";
import { audit } from "./audit";
import { currentSession } from "./session";
import { setRequestCompanyResolver } from "./tenant";

/** Empresas que o usuário pode abrir (SUPERADMIN: todas as ativas). */
export async function companiesOf(user: { id: string; roles: { role: string }[] }) {
  const roles = user.roles.map((r) => r.role as Role);
  return base.company.findMany({
    where: {
      status: "ATIVA",
      ...(seesAllCompanies(roles) ? {} : { members: { some: { userId: user.id } } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, isDemo: true, timezone: true },
  });
}

/**
 * Empresa aberta nesta requisição: a da sessão, se o usuário ainda tiver acesso; senão a primeira
 * disponível (e a sessão passa a apontar para ela). Sem nenhuma empresa: null.
 */
export const activeCompany = cache(async () => {
  const session = await currentSession();
  if (!session) return null;
  const list = await companiesOf(session.user);
  const found = list.find((c) => c.id === session.activeCompanyId) ?? list[0] ?? null;
  if (found && found.id !== session.activeCompanyId)
    await base.session.update({ where: { id: session.id }, data: { activeCompanyId: found.id } });
  return found;
});

setRequestCompanyResolver(async () => (await activeCompany())?.id ?? null);

/** Troca a empresa aberta (só para uma que o usuário pode abrir). */
export async function switchCompany(companyId: string): Promise<boolean> {
  const session = await currentSession();
  if (!session) return false;
  const list = await companiesOf(session.user);
  if (!list.some((c) => c.id === companyId)) return false;
  await base.session.update({ where: { id: session.id }, data: { activeCompanyId: companyId } });
  await audit({ actorId: session.userId, action: "company.switched", entity: "Company", entityId: companyId });
  return true;
}

// ─── Cadastro de empresas (SUPERADMIN) ─────────────────

export type CompanyResult = { ok: true; message: string; secret?: string } | { ok: false; message: string };

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export async function createCompany(actorId: string, nameInput: string): Promise<CompanyResult> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Nome da empresa: de 2 a 80 letras." };
  let slug = slugify(name) || "empresa";
  for (let i = 2; await base.company.findUnique({ where: { slug } }); i++) slug = `${slugify(name)}-${i}`;
  const c = await base.company.create({ data: { name, slug } });
  await audit({ actorId, action: "company.created", entity: "Company", entityId: c.id, after: { name, slug } });
  return { ok: true, message: `Empresa "${name}" criada.` };
}

export async function setCompanyStatus(actorId: string, companyId: string, active: boolean): Promise<CompanyResult> {
  const c = await base.company.findUnique({ where: { id: companyId } });
  if (!c) return { ok: false, message: "Empresa não encontrada." };
  await base.company.update({ where: { id: c.id }, data: { status: active ? "ATIVA" : "SUSPENSA" } });
  await audit({
    actorId,
    action: active ? "company.reactivated" : "company.suspended",
    entity: "Company",
    entityId: c.id,
  });
  return { ok: true, message: active ? "Empresa reativada." : "Empresa suspensa: ninguém consegue abri-la." };
}

export async function grantCompanyAccess(
  actorId: string,
  companyId: string,
  emailInput: string,
): Promise<CompanyResult> {
  const email = emailInput.trim().toLowerCase();
  const user = await base.user.findUnique({ where: { email } });
  if (!user) return { ok: false, message: "Nenhum usuário com esse e-mail. Cadastre em Equipe e acessos." };
  await base.companyMember.upsert({
    where: { companyId_userId: { companyId, userId: user.id } },
    update: {},
    create: { companyId, userId: user.id },
  });
  await audit({ actorId, action: "company.access_granted", entity: "Company", entityId: companyId, after: { userId: user.id } });
  return { ok: true, message: `${user.name} agora pode abrir esta empresa.` };
}

export async function revokeCompanyAccess(actorId: string, companyId: string, userId: string): Promise<CompanyResult> {
  await base.companyMember.deleteMany({ where: { companyId, userId } });
  await base.session.updateMany({ where: { userId, activeCompanyId: companyId }, data: { activeCompanyId: null } });
  await audit({ actorId, action: "company.access_revoked", entity: "Company", entityId: companyId, after: { userId } });
  return { ok: true, message: "Acesso retirado." };
}

// ─── Chaves da API da fonte de vendas ─────────────────

const pepper = () => process.env.HASH_PEPPER ?? "";
const hashSecret = (secret: string) => createHash("sha256").update(`${pepper()}:api-key:${secret}`).digest("hex");

/** Gera uma chave nova. O valor completo aparece UMA vez para quem criou; no banco fica só o hash. */
export async function createApiKey(actorId: string, companyId: string, nameInput: string): Promise<CompanyResult> {
  const name = nameInput.trim().slice(0, 60) || "Integração";
  const active = await base.apiKey.count({ where: { companyId, revokedAt: null } });
  if (active >= 10) return { ok: false, message: "Limite de 10 chaves ativas por empresa. Revogue uma antes." };
  const id = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const prefix = `${API_KEY_PREFIX}${id}`;
  await base.apiKey.create({
    data: { companyId, name, prefix, secretHash: hashSecret(secret), createdById: actorId },
  });
  await audit({ actorId, action: "apikey.created", entity: "Company", entityId: companyId, after: { prefix, name } });
  return { ok: true, message: "Chave criada. Copie agora: ela não será mostrada de novo.", secret: `${prefix}_${secret}` };
}

export async function revokeApiKey(actorId: string, companyId: string, keyId: string): Promise<CompanyResult> {
  const r = await base.apiKey.updateMany({
    where: { id: keyId, companyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedById: actorId },
  });
  if (!r.count) return { ok: false, message: "Chave não encontrada ou já revogada." };
  await audit({ actorId, action: "apikey.revoked", entity: "Company", entityId: companyId, after: { keyId } });
  return { ok: true, message: "Chave revogada: os sistemas que a usam deixam de enviar dados." };
}

/** Confere "Authorization: Bearer tmp_xxx_segredo". Devolve a empresa ou null. */
export async function companyFromApiKey(header: string | null) {
  const raw = header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!isApiKeyFormat(raw)) return null;
  const sep = raw.indexOf("_", API_KEY_PREFIX.length);
  const prefix = raw.slice(0, sep);
  const secret = raw.slice(sep + 1);
  const key = await base.apiKey.findUnique({ where: { prefix }, include: { company: true } });
  if (!key || key.revokedAt || key.company.status !== "ATIVA") return null;
  const a = Buffer.from(hashSecret(secret));
  const b = Buffer.from(key.secretHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
    await base.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { companyId: key.companyId, keyId: key.id, isDemo: key.company.isDemo };
}
