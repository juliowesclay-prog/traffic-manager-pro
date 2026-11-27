import "server-only";
import { buildObjectStorySpec, checkAdPolicy, parseMetaSubmission, type MetaCreativeMedia } from "@tmp/core";
import { decrypt, Prisma } from "@tmp/db";
import { audit } from "../audit";
import { prisma } from "../db";
import { rateLimit } from "../rate-limit";
import { metaByName } from "../traffic";
import { MetaError, type MetaPageInfo } from "../traffic/meta-gateway";
import { selectedAccount } from "../traffic/meta-actions";
import { storage } from "./storage";

/**
 * Enviar para Meta (Etapa 6): sobe a mídia do criativo APROVADO para a conta de anúncios escolhida,
 * cria o criativo e o anúncio dentro de um conjunto existente — SEMPRE pausado. Nada é ativado aqui.
 * Só Gestor e Superadmin (permissão marketing:approve). Cada envio fica registrado (meta_ad_submissions).
 */

export type SendResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

/** Conta, conjuntos (com a campanha) e páginas disponíveis para montar o envio. */
export async function sendContext() {
  const { conn, account } = await selectedAccount();
  if (!conn || !account)
    return {
      ready: false as const,
      reason: "Conecte a Meta e escolha a conta de anúncios no Gestor de Tráfego.",
    };
  if (!conn.scopes.includes("ads_management"))
    return {
      ready: false as const,
      reason: "A conexão com a Meta não tem a permissão de gerenciar anúncios. Conecte de novo.",
    };
  const [adSets, campaigns] = await Promise.all([
    prisma.metaAdSet.findMany({
      where: { accountId: account.accountId, missingSince: null, status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { externalId: true, name: true, campaignExternalId: true, status: true },
    }),
    prisma.metaCampaign.findMany({
      where: { accountId: account.accountId, missingSince: null },
      select: { externalId: true, name: true, status: true },
    }),
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.externalId, c]));
  let pages: MetaPageInfo[] = [];
  let pagesError: string | null = null;
  try {
    pages = await metaByName(conn.provider).publish.pages(decrypt(conn.tokenEnc!), account.accountId);
  } catch (e) {
    pagesError = e instanceof MetaError ? e.message : "Não foi possível ler as páginas.";
  }
  return {
    ready: true as const,
    demo: conn.provider === "simulado",
    account: { id: account.accountId, name: account.name },
    adSets: adSets
      .filter((s) => campaignName.get(s.campaignExternalId)?.status !== "ARCHIVED")
      .map((s) => ({
        id: s.externalId,
        name: s.name,
        status: s.status,
        campaign: campaignName.get(s.campaignExternalId)?.name ?? s.campaignExternalId,
      })),
    pages,
    pagesError,
  };
}

async function readAll(key: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const r = storage().stream(key).getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function sendToMeta(
  userId: string,
  creativeId: string,
  raw: Record<string, unknown>,
  confirmedPolicy: boolean,
): Promise<SendResult> {
  const parsed = parseMetaSubmission(raw);
  if (!parsed.ok) return parsed;
  const s = parsed.value;
  const policy = checkAdPolicy(s.primaryText, s.headline, s.description);
  if (policy.length && !confirmedPolicy)
    return {
      ok: false,
      message: `Revise o texto: ${policy.map((p) => p.motivo).join(" ")} Se estiver certo, marque a confirmação.`,
    };
  if (!confirmedPolicy)
    return { ok: false, message: "Confirme que revisou o texto e as políticas de anúncios da Meta." };
  if (!(await rateLimit(`mkt-meta:${userId}`, 20, 60 * 60)))
    return { ok: false, message: "Muitos envios na última hora. Aguarde." };

  const c = await prisma.creative.findFirst({
    where: { id: creativeId },
    include: {
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { assets: { where: { status: "PRONTO" }, orderBy: { position: "asc" } } },
      },
    },
  });
  const v = c?.versions[0];
  if (!c || !v) return { ok: false, message: "Criativo não encontrado." };
  if (c.status !== "APROVADO" || c.approvedVersion !== v.number)
    return { ok: false, message: "Só criativos aprovados (na versão atual) podem ir para a Meta." };
  if (!v.assets.length) return { ok: false, message: "O criativo não tem arquivo pronto." };

  const { conn, account } = await selectedAccount();
  if (!conn?.tokenEnc || !account)
    return { ok: false, message: "Conecte a Meta e escolha a conta de anúncios no Gestor de Tráfego." };
  if (!conn.scopes.includes("ads_management"))
    return {
      ok: false,
      message: "A conexão com a Meta não tem a permissão de gerenciar anúncios. Conecte de novo.",
    };
  const adSet = await prisma.metaAdSet.findFirst({
    where: { accountId: account.accountId, externalId: s.adSetId, missingSince: null },
  });
  if (!adSet)
    return {
      ok: false,
      message: "Conjunto de anúncios não encontrado na conta escolhida. Sincronize os anúncios.",
    };

  let sub;
  try {
    sub = await prisma.metaAdSubmission.create({
      data: {
        creativeId: c.id,
        versionNumber: v.number,
        accountId: account.accountId,
        campaignId: adSet.campaignExternalId,
        adSetId: s.adSetId,
        pageId: s.pageId,
        instagramId: s.instagramId,
        adName: s.adName,
        primaryText: s.primaryText,
        headline: s.headline,
        description: s.description || null,
        link: s.link,
        callToAction: s.callToAction,
        isDemo: conn.provider === "simulado",
        createdById: userId,
      } as Prisma.MetaAdSubmissionUncheckedCreateInput,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, message: "Este criativo já está sendo enviado. Aguarde terminar." };
    throw e;
  }

  const gw = metaByName(conn.provider).publish;
  const token = decrypt(conn.tokenEnc);
  const step = { now: "envio da mídia" };
  try {
    let media: MetaCreativeMedia;
    const hashes: string[] = [];
    let videoId: string | null = null;
    if (c.kind === "VIDEO") {
      const a = v.assets[0]!;
      const st = storage();
      const source = st.presignGet
        ? {
            url: await st.presignGet(a.storageKey, {
              expiresSeconds: 3600,
              filename: "video.mp4",
              contentType: a.mimeType ?? "video/mp4",
              download: true,
            }),
          }
        : { bytes: await readAll(a.storageKey), filename: "video.mp4" };
      const up = await gw.uploadVideo(token, account.accountId, source, c.name);
      videoId = up.videoId;
      media = { kind: "VIDEO", videoId: up.videoId, thumbnailUrl: up.thumbnailUrl };
    } else {
      for (const [i, a] of v.assets.entries())
        hashes.push(
          await gw.uploadImage(
            token,
            account.accountId,
            await readAll(a.storageKey),
            `${c.name}-${i + 1}.${a.storageKey.split(".").pop()}`,
          ),
        );
      media =
        c.kind === "CARROSSEL"
          ? { kind: "CARROSSEL", imageHashes: hashes }
          : { kind: "IMAGEM", imageHash: hashes[0]! };
    }
    step.now = "criação do criativo";
    const metaCreativeId = await gw.createCreative(
      token,
      account.accountId,
      s.adName,
      buildObjectStorySpec(s, media),
    );
    step.now = "criação do anúncio";
    const metaAdId = await gw.createPausedAd(token, account.accountId, {
      name: s.adName,
      adSetId: s.adSetId,
      creativeId: metaCreativeId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.metaAdSubmission.update({
        where: { id: sub.id },
        data: {
          status: "ENVIADO",
          metaImageHashes: hashes,
          metaVideoId: videoId,
          metaCreativeId,
          metaAdId,
          finishedAt: new Date(),
        },
      });
      await tx.creative.updateMany({
        where: { id: c.id, status: "APROVADO" },
        data: { status: "ENVIADO_META", metaAdIds: { push: metaAdId } },
      });
    });
    await audit({
      actorId: userId,
      action: "marketing.sent_to_meta",
      entity: "Creative",
      entityId: c.id,
      after: {
        conta: account.accountId,
        conjunto: s.adSetId,
        anuncio: metaAdId,
        versao: v.number,
        status: "PAUSED",
        demo: conn.provider === "simulado",
      },
    });
    return {
      ok: true,
      message: `Anúncio criado na Meta, PAUSADO (código ${metaAdId}). Revise e ative no Gerenciador de Anúncios quando quiser.`,
      id: sub.id,
    };
  } catch (e) {
    const msg = e instanceof MetaError ? e.message : "Erro inesperado ao enviar para a Meta.";
    const detail = e instanceof MetaError ? (e.detail ?? "") : String(e);
    console.error("enviar-meta", step.now, detail);
    await prisma.metaAdSubmission.update({
      where: { id: sub.id },
      data: {
        status: "FALHOU",
        error: `${step.now}: ${msg} ${detail}`.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    await audit({
      actorId: userId,
      action: "marketing.send_to_meta_failed",
      entity: "Creative",
      entityId: c.id,
      after: { etapa: step.now, erro: detail.slice(0, 200) },
    });
    if (!(e instanceof MetaError)) throw e;
    return { ok: false, message: `${msg} (falhou na ${step.now}; nada foi ativado)` };
  }
}

export async function submissionsFor(creativeId?: string) {
  return prisma.metaAdSubmission.findMany({
    where: creativeId ? { creativeId } : {},
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { creative: { select: { name: true } } },
  });
}

// ─── Vínculo manual com anúncio existente (para medir desempenho, Etapa 7) ─────────────────

export async function linkExistingAd(
  userId: string,
  creativeId: string,
  adExternalId: string,
): Promise<SendResult> {
  const c = await prisma.creative.findFirst({ where: { id: creativeId } });
  if (!c) return { ok: false, message: "Criativo não encontrado." };
  const ad = await prisma.metaAd.findFirst({ where: { externalId: adExternalId } });
  if (!ad) return { ok: false, message: "Anúncio não encontrado nos dados sincronizados." };
  if (c.metaAdIds.includes(adExternalId)) return { ok: false, message: "Este anúncio já está vinculado." };
  await prisma.creative.updateMany({ where: { id: c.id }, data: { metaAdIds: { push: adExternalId } } });
  await audit({
    actorId: userId,
    action: "marketing.ad_linked",
    entity: "Creative",
    entityId: c.id,
    after: { anuncio: adExternalId },
  });
  return { ok: true, message: `Anúncio "${ad.name}" vinculado. O desempenho aparece em Desempenho.` };
}

export async function unlinkAd(
  userId: string,
  creativeId: string,
  adExternalId: string,
): Promise<SendResult> {
  const c = await prisma.creative.findFirst({ where: { id: creativeId } });
  if (!c || !c.metaAdIds.includes(adExternalId)) return { ok: false, message: "Vínculo não encontrado." };
  const sent = await prisma.metaAdSubmission.findFirst({
    where: { creativeId, metaAdId: adExternalId, status: "ENVIADO" },
  });
  if (sent) return { ok: false, message: "Anúncio criado por aqui fica vinculado para histórico." };
  await prisma.creative.updateMany({
    where: { id: c.id },
    data: { metaAdIds: c.metaAdIds.filter((x) => x !== adExternalId) },
  });
  await audit({
    actorId: userId,
    action: "marketing.ad_unlinked",
    entity: "Creative",
    entityId: c.id,
    before: { anuncio: adExternalId },
  });
  return { ok: true, message: "Vínculo removido." };
}
