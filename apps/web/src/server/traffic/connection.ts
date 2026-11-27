import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  META_SCOPE_LABELS,
  META_STATE_TTL_MINUTES,
  metaAccountUsable,
  metaCallbackErrorMessage,
  metaTokenHealth,
  missingMetaScopes,
} from "@prosed/core";
import { decrypt, encrypt, prisma } from "@prosed/db";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { activeMeta, metaByName, metaProviderName, metaRedirectUri, MetaError } from "./index";

/**
 * Conexão do Prosed+ Saúde com a Meta (entrega 8.1).
 * - A chave de acesso fica cifrada no banco e nunca vai para a tela, para logs ou para a auditoria.
 * - O fluxo de autorização usa "state" aleatório de uso único, preso ao usuário logado e a um cookie
 *   httpOnly, válido por 10 minutos (impede que alguém ligue a conta de anúncios DELE ao nosso sistema).
 * - Só uma conexão ativa e uma conta escolhida por vez (garantido também no banco).
 */

export type TrafficResult = { ok: boolean; message: string };
/** Resultado do retorno da Meta: só códigos fixos vão para o endereço da tela (nunca texto livre). */
export type ConnectCode =
  "conectado" | "cancelado" | "invalido" | "expirou" | "permissoes" | "recusado" | "indisponivel";
export type ConnectResult = { ok: boolean; code: ConnectCode; message: string };
export const META_STATE_COOKIE = "prosed_meta_state";
const REVOKE_PENDING =
  "A Meta não confirmou a retirada das permissões. Confira na Meta em Configurações → Integrações comerciais e remova o app Prosed+ Saúde.";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const safeError = (e: unknown) =>
  e instanceof MetaError ? e.message : "Não foi possível falar com a Meta agora. Tente de novo.";

/** Começa a conexão: cria o "state" e devolve o endereço da tela de autorização. */
export async function startMetaConnect(
  userId: string,
): Promise<{ ok: true; url: string; state: string } | TrafficResult> {
  if (!metaProviderName())
    return { ok: false, message: "A integração com a Meta ainda não foi configurada." };
  if (!(await rateLimit(`meta-connect:${userId}`, 10, 3600)))
    return { ok: false, message: "Muitas tentativas de conexão. Espere alguns minutos." };
  const state = randomBytes(32).toString("base64url");
  await prisma.metaOAuthState.create({
    data: {
      stateHash: sha(state),
      userId,
      expiresAt: new Date(Date.now() + META_STATE_TTL_MINUTES * 60_000),
    },
  });
  try {
    return { ok: true, url: activeMeta().authorizeUrl(state, metaRedirectUri()), state };
  } catch (e) {
    return { ok: false, message: safeError(e) };
  }
}

/** Retorno da Meta. Confere o state, troca o código e grava a conexão. */
export async function finishMetaConnect(
  userId: string,
  q: { code: string | null; state: string | null; error: string | null; errorReason: string | null },
  cookieState: string | null,
): Promise<ConnectResult> {
  // 1) state: veio, bate com o cookie, é deste usuário, não venceu e não foi usado (uso único atômico).
  if (!q.state || !cookieState || !same(q.state, cookieState))
    return {
      ok: false,
      code: "invalido",
      message: "Não foi possível confirmar a autorização. Comece de novo pelo botão Conectar.",
    };
  const claimed = await prisma.metaOAuthState.updateMany({
    where: { stateHash: sha(q.state), userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1)
    return {
      ok: false,
      code: "expirou",
      message: "A autorização venceu ou já foi usada. Comece de novo pelo botão Conectar.",
    };
  if (q.error || !q.code)
    return {
      ok: false,
      code: q.error === "access_denied" || q.errorReason === "user_denied" ? "cancelado" : "recusado",
      message: metaCallbackErrorMessage(q.error, q.errorReason),
    };

  const meta = activeMeta();
  try {
    // 2) código → chave de longa duração; conferir que é válida, do nosso app, e com as permissões.
    const { token, expiresAt } = await meta.exchangeCode(q.code, metaRedirectUri());
    const info = await meta.inspectToken(token);
    if (!info.valid)
      return {
        ok: false,
        code: "recusado",
        message: "A Meta devolveu uma autorização inválida. Tente de novo.",
      };
    const missing = missingMetaScopes(info.scopes);
    if (missing.length)
      return {
        ok: false,
        code: "permissoes",
        message: `Faltou autorizar: ${missing.map((s) => META_SCOPE_LABELS[s] ?? s).join("; ")}. Conecte de novo e mantenha essas opções marcadas.`,
      };
    const [me, accounts] = await Promise.all([meta.me(token), meta.adAccounts(token)]);

    // 3) grava: a conexão anterior (se houver) é encerrada; a conta escolhida antes continua escolhida
    //    se ainda estiver disponível.
    const previouslySelected = await prisma.metaAdAccount.findFirst({ where: { selected: true } });
    const conn = await prisma.$transaction(async (tx) => {
      await tx.metaAdAccount.updateMany({ where: { selected: true }, data: { selected: false } });
      await tx.metaConnection.updateMany({
        where: { status: "ATIVA" },
        data: {
          status: "DESCONECTADA",
          tokenEnc: null,
          disconnectedAt: new Date(),
          disconnectedById: userId,
        },
      });
      const c = await tx.metaConnection.create({
        data: {
          provider: meta.name,
          metaUserId: me.id,
          metaUserName: me.name.slice(0, 120),
          tokenEnc: encrypt(token),
          tokenExpiresAt: info.expiresAt ?? expiresAt,
          scopes: info.scopes,
          connectedById: userId,
          lastCheckedAt: new Date(),
        },
      });
      for (const a of accounts) {
        const keep = previouslySelected?.accountId === a.accountId && metaAccountUsable(a.accountStatus);
        await tx.metaAdAccount.create({
          data: {
            connectionId: c.id,
            ...a,
            name: a.name.slice(0, 200),
            isDemo: meta.name === "simulado",
            ...(keep ? { selected: true, selectedById: userId, selectedAt: new Date() } : {}),
          },
        });
      }
      return c;
    });
    await audit({
      actorId: userId,
      action: "traffic.meta_connected",
      entity: "MetaConnection",
      entityId: conn.id,
      after: { provedor: meta.name, usuarioMeta: me.name, permissoes: info.scopes, contas: accounts.length },
    });
    return {
      ok: true,
      code: "conectado",
      message: `Conectado à Meta como ${me.name}. ${accounts.length} conta(s) de anúncio encontrada(s).`,
    };
  } catch (e) {
    if (e instanceof MetaError) console.error("Meta (conectar):", e.detail);
    return { ok: false, code: "indisponivel", message: safeError(e) };
  }
}

export async function activeConnection() {
  return prisma.metaConnection.findFirst({
    where: { status: "ATIVA" },
    include: { accounts: { orderBy: [{ selected: "desc" }, { name: "asc" }] } },
  });
}

/** Escolhe a conta usada pelo Prosed+ Saúde (só contas ativas da conexão atual). */
export async function selectAdAccount(userId: string, accountRowId: string): Promise<TrafficResult> {
  const conn = await activeConnection();
  const acc = conn?.accounts.find((a) => a.id === accountRowId);
  if (!conn || !acc) return { ok: false, message: "Conta não encontrada na conexão atual." };
  if (!metaAccountUsable(acc.accountStatus))
    return { ok: false, message: "Esta conta não está ativa na Meta e não pode ser usada." };
  if (acc.selected) return { ok: true, message: "Esta já é a conta em uso." };
  await prisma.$transaction([
    prisma.metaAdAccount.updateMany({ where: { selected: true }, data: { selected: false } }),
    prisma.metaAdAccount.update({
      where: { id: acc.id },
      data: { selected: true, selectedById: userId, selectedAt: new Date() },
    }),
  ]);
  await audit({
    actorId: userId,
    action: "traffic.account_selected",
    entity: "MetaAdAccount",
    entityId: acc.id,
    after: { conta: acc.accountId, nome: acc.name },
  });
  return { ok: true, message: `Conta escolhida: ${acc.name}.` };
}

/** Busca de novo a lista de contas na Meta (atualiza nomes e situação; tira as que sumiram). */
export async function refreshAdAccounts(userId: string): Promise<TrafficResult> {
  const conn = await activeConnection();
  if (!conn?.tokenEnc) return { ok: false, message: "Não há conexão ativa com a Meta." };
  if (!(await rateLimit(`meta-refresh:${userId}`, 20, 3600)))
    return { ok: false, message: "Muitas atualizações seguidas. Espere alguns minutos." };
  try {
    const meta = metaByName(conn.provider);
    const accounts = await meta.adAccounts(decrypt(conn.tokenEnc));
    const ids = new Set(accounts.map((a) => a.accountId));
    const selectedGone = conn.accounts.some((a) => a.selected && !ids.has(a.accountId));
    await prisma.$transaction(async (tx) => {
      await tx.metaAdAccount.deleteMany({ where: { connectionId: conn.id, accountId: { notIn: [...ids] } } });
      for (const a of accounts) {
        const data = { ...a, name: a.name.slice(0, 200) };
        await tx.metaAdAccount.upsert({
          where: { connectionId_accountId: { connectionId: conn.id, accountId: a.accountId } },
          create: { connectionId: conn.id, ...data, isDemo: conn.provider === "simulado" },
          update: data,
        });
      }
      // Conta escolhida que deixou de estar ativa: deixa de ser usada.
      await tx.metaAdAccount.updateMany({
        where: { connectionId: conn.id, selected: true, accountStatus: { notIn: [1, 9, 201] } },
        data: { selected: false },
      });
      await tx.metaConnection.update({
        where: { id: conn.id },
        data: {
          lastCheckedAt: new Date(),
          lastError: selectedGone ? "A conta escolhida não está mais disponível nesta conexão." : null,
        },
      });
    });
    await audit({
      actorId: userId,
      action: "traffic.accounts_refreshed",
      entity: "MetaConnection",
      entityId: conn.id,
      after: { contas: accounts.length },
    });
    return { ok: true, message: `Lista atualizada: ${accounts.length} conta(s).` };
  } catch (e) {
    if (e instanceof MetaError) {
      console.error("Meta (contas):", e.detail);
      if (e.tokenInvalid)
        await prisma.metaConnection.update({
          where: { id: conn.id },
          data: {
            lastError: "A conexão venceu ou foi retirada na Meta. Conecte de novo.",
            lastCheckedAt: new Date(),
          },
        });
    }
    return { ok: false, message: safeError(e) };
  }
}

/** Desconecta: pede à Meta para retirar as permissões e apaga a chave daqui. */
export async function disconnectMeta(userId: string): Promise<TrafficResult> {
  const conn = await activeConnection();
  if (!conn) return { ok: false, message: "Não há conexão ativa." };
  let revokedAtMeta = true;
  if (conn.tokenEnc) {
    try {
      await metaByName(conn.provider).revoke(decrypt(conn.tokenEnc));
    } catch (e) {
      revokedAtMeta = false;
      if (e instanceof MetaError) console.error("Meta (desconectar):", e.detail);
    }
  }
  await prisma.$transaction([
    prisma.metaAdAccount.updateMany({ where: { connectionId: conn.id }, data: { selected: false } }),
    prisma.metaConnection.update({
      where: { id: conn.id },
      data: {
        status: "DESCONECTADA",
        tokenEnc: null,
        disconnectedAt: new Date(),
        disconnectedById: userId,
        lastError: revokedAtMeta ? null : REVOKE_PENDING,
      },
    }),
  ]);
  await audit({
    actorId: userId,
    action: "traffic.meta_disconnected",
    entity: "MetaConnection",
    entityId: conn.id,
    after: { permissoesRetiradasNaMeta: revokedAtMeta },
  });
  return {
    ok: true,
    message: revokedAtMeta
      ? "Desconectado. A chave foi apagada e as permissões foram retiradas na Meta."
      : `Desconectado aqui (a chave foi apagada). ${REVOKE_PENDING}`,
  };
}

/** Tudo o que a tela mostra (sem a chave). */
export async function trafficOverview(now = new Date()) {
  const conn = await activeConnection();
  const provider = metaProviderName();
  // Sem conexão ativa: avisa se a última desconexão (últimas 72 h) deixou permissões na Meta.
  // Só a ÚLTIMA desconexão conta: se ela não retirou as permissões, avisa.
  const lastDisconnect = conn
    ? null
    : await prisma.metaConnection.findFirst({
        where: { status: "DESCONECTADA", disconnectedAt: { gte: new Date(now.getTime() - 72 * 3_600_000) } },
        orderBy: { disconnectedAt: "desc" },
        select: { lastError: true },
      });
  return {
    provider,
    disconnectWarning: lastDisconnect?.lastError === REVOKE_PENDING ? REVOKE_PENDING : null,
    connection: conn
      ? {
          id: conn.id,
          provider: conn.provider,
          metaUserName: conn.metaUserName,
          connectedAt: conn.connectedAt,
          lastCheckedAt: conn.lastCheckedAt,
          lastError: conn.lastError,
          scopes: conn.scopes,
          missingScopes: missingMetaScopes(conn.scopes),
          health: metaTokenHealth(conn.tokenExpiresAt, now),
          tokenExpiresAt: conn.tokenExpiresAt,
          accounts: conn.accounts.map(({ connectionId: _c, selectedById: _s, ...a }) => a),
        }
      : null,
    redirectUri: metaRedirectUri(),
  };
}
