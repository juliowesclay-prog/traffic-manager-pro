import "server-only";
import {
  ART_FORMATS,
  checkAdPolicy,
  parseArtSpec,
  parseCarouselSpec,
  parseCreativeName,
  reviewStudioOutput,
  STUDIO_GOALS,
  STUDIO_LIMITS,
  STUDIO_TONES,
  studioTexts,
  unapprovedPrices,
  type ArtFormat,
  type ArtSpec,
  type CarouselSpec,
  type StudioGoal,
  type StudioInput,
  type StudioOutput,
  type StudioTone,
} from "@tmp/core";
import type { Prisma } from "@tmp/db";
import { audit } from "../audit";
import { prisma } from "../db";
import { rateLimit } from "../rate-limit";
import { generateBackground, ImageGenError, imageProviderName } from "./ai-image";
import { activeCopywriter, CopywriterError } from "./ai-text";
import { addVersion, createCreative, pinBackground, type CreativeResult } from "./creatives";
import { storeGenerated } from "./media";
import { renderArt, renderCarousel } from "./render";

/**
 * Estúdio IA, Criar Artes e Criar Carrossel (Etapas 2 e 3): pedidos à IA, desenho das artes e
 * gravação na biblioteca. Tudo da empresa aberta (filtro automático) e registrado na auditoria.
 */

export type StudioResult = { ok: true; id: string } | { ok: false; message: string };

const clip = (v: string, n: number) => v.replace(/\s+/g, " ").trim().slice(0, n);

/** Marca com as informações oficiais APROVADAS (as únicas que a IA pode usar). */
export async function brandForAi(brandId: string | null): Promise<StudioInput["marca"]> {
  if (!brandId) return null;
  const b = await prisma.brand.findFirst({
    where: { id: brandId },
    include: { facts: { where: { status: "APROVADO" }, orderBy: { createdAt: "asc" }, take: 60 } },
  });
  if (!b) return null;
  return {
    nome: b.name,
    sobre: b.about,
    site: b.website,
    chamadas: b.ctas,
    fatos: b.facts.map((f) => ({ id: f.id, tipo: f.kind, titulo: f.title, detalhe: f.detail })),
  };
}

export async function runStudio(
  userId: string,
  raw: {
    brandId: string | null;
    objetivo: string;
    tom: string;
    publico: string;
    assunto: string;
    pedido: string;
  },
): Promise<StudioResult> {
  if (!(raw.objetivo in STUDIO_GOALS)) return { ok: false, message: "Escolha o objetivo." };
  if (!(raw.tom in STUDIO_TONES)) return { ok: false, message: "Escolha o tom." };
  const assunto = clip(raw.assunto, STUDIO_LIMITS.topic);
  const pedido = raw.pedido.trim().slice(0, STUDIO_LIMITS.request);
  if (assunto.length < 3 && pedido.length < 3)
    return { ok: false, message: "Conte o assunto do anúncio (o que você quer divulgar)." };
  const marca = await brandForAi(raw.brandId);
  if (raw.brandId && !marca) return { ok: false, message: "Marca não encontrada." };
  const input: StudioInput = {
    objetivo: raw.objetivo as StudioGoal,
    tom: raw.tom as StudioTone,
    publico: clip(raw.publico, STUDIO_LIMITS.audience),
    assunto,
    pedido,
    marca,
  };
  return generate(userId, input, raw.brandId, null);
}

export async function refineStudio(
  userId: string,
  parentId: string,
  instrucao: string,
): Promise<StudioResult> {
  const text = clip(instrucao, STUDIO_LIMITS.refine);
  if (text.length < 3) return { ok: false, message: "Diga o que você quer mudar." };
  const parent = await prisma.marketingGeneration.findFirst({ where: { id: parentId } });
  if (!parent) return { ok: false, message: "Resultado não encontrado." };
  const prev = parent.input as unknown as StudioInput;
  // A marca é lida de novo: se uma informação deixou de ser aprovada, não volta para a IA.
  const input: StudioInput = {
    ...prev,
    marca: await brandForAi(parent.brandId),
    ajuste: { instrucao: text, anterior: parent.output as unknown as StudioOutput },
  };
  return generate(userId, input, parent.brandId, parent.id);
}

async function generate(
  userId: string,
  input: StudioInput,
  brandId: string | null,
  parentId: string | null,
): Promise<StudioResult> {
  if (!(await rateLimit(`mkt-estudio:${userId}`, 30, 60 * 60)))
    return { ok: false, message: "Muitos pedidos à IA na última hora. Aguarde um pouco." };
  let writer;
  try {
    writer = activeCopywriter();
  } catch (e) {
    if (e instanceof CopywriterError) return { ok: false, message: e.message };
    throw e;
  }
  let res;
  try {
    res = await writer.write(input);
  } catch (e) {
    if (e instanceof CopywriterError) {
      console.error("estudio-ia", e.detail ?? e.message);
      return { ok: false, message: e.message };
    }
    throw e;
  }
  const output = reviewStudioOutput(res.output, input);
  const { ajuste: _ajuste, ...stored } = input;
  const row = await prisma.marketingGeneration.create({
    data: {
      brandId,
      parentId,
      input: stored as unknown as Prisma.InputJsonValue,
      output: output as unknown as Prisma.InputJsonValue,
      provider: writer.name,
      model: writer.model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      isDemo: writer.name === "simulado",
      createdById: userId,
    } as Prisma.MarketingGenerationUncheckedCreateInput,
  });
  await audit({
    actorId: userId,
    action: "marketing.studio_generated",
    entity: "MarketingGeneration",
    entityId: row.id,
    after: {
      provedor: writer.name,
      modelo: writer.model,
      tokens_entrada: res.inputTokens,
      tokens_saida: res.outputTokens,
      ajuste: !!parentId,
    },
  });
  return { ok: true, id: row.id };
}

/** Histórico do Estúdio (últimos pedidos) e um resultado com os alertas de política. */
export async function listGenerations(take = 20) {
  return prisma.marketingGeneration.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      createdAt: true,
      input: true,
      provider: true,
      model: true,
      isDemo: true,
      parentId: true,
    },
  });
}

export async function getGeneration(id: string) {
  const g = await prisma.marketingGeneration.findFirst({ where: { id } });
  if (!g) return null;
  const output = g.output as unknown as StudioOutput;
  const input = g.input as unknown as StudioInput;
  const texts = studioTexts(output);
  return {
    ...g,
    output,
    studioInput: input,
    policy: checkAdPolicy(...texts),
    prices: unapprovedPrices(texts, input.marca?.fatos ?? []),
  };
}

// ─── Artes (Etapa 2) ─────────────────

async function renderBrand(brandId: string | null) {
  if (!brandId) return null;
  const b = await prisma.brand.findFirst({ where: { id: brandId }, select: { logoAssetId: true } });
  return b ? { logoAssetId: b.logoAssetId } : null;
}

export async function previewArt(
  input: Record<string, unknown>,
): Promise<{ ok: true; png: Uint8Array } | { ok: false; message: string }> {
  const p = parseArtSpec(input);
  if (!p.ok) return p;
  return { ok: true, png: await renderArt(p.spec, await renderBrand(p.spec.brandId)) };
}

export async function previewCarouselPage(
  input: Record<string, unknown>,
  page: number,
): Promise<{ ok: true; png: Uint8Array } | { ok: false; message: string }> {
  const p = parseCarouselSpec(input);
  if (!p.ok) return p;
  const i = Math.min(Math.max(0, page), p.spec.pages.length - 1);
  // Desenha só a página pedida, mantendo a numeração e o papel (capa/meio/final) dela.
  const pages = await renderCarousel(p.spec, await renderBrand(p.spec.brandId), i);
  return { ok: true, png: pages[0]! };
}

/** Salva a arte: desenha, guarda o PNG e cria o criativo (rascunho) ou uma versão nova dele. */
export async function saveArt(
  userId: string,
  input: Record<string, unknown>,
  target: { creativeId: string | null; name: string; note: string },
): Promise<CreativeResult> {
  const p = parseArtSpec(input);
  if (!p.ok) return p;
  if (!(await rateLimit(`mkt-arte:${userId}`, 60, 60 * 60)))
    return { ok: false, message: "Muitas artes geradas na última hora. Aguarde um pouco." };
  const spec: ArtSpec = p.spec;
  const name = target.creativeId ? "arte" : parseCreativeName(target.name);
  if (!name) return { ok: false, message: "Nome do criativo: de 2 a 120 letras." };
  const png = await renderArt(spec, await renderBrand(spec.brandId));
  const stored = await storeGenerated(userId, png, `${name}-${spec.format}`);
  if (!stored.ok) return stored;
  await pinBackground(spec.backgroundAssetId);
  const recipe = { tipo: "arte", ...spec } as unknown as Prisma.InputJsonValue;
  const policy = checkAdPolicy(spec.title, spec.subtitle, spec.cta, spec.highlight);
  const warn = policy.length ? ` Atenção: ${policy.map((w) => w.motivo).join(" ")}` : "";
  if (target.creativeId) {
    const r = await addVersion(userId, target.creativeId, {
      assetIds: [stored.asset.id],
      note: target.note || "Arte editada",
      spec: recipe,
    });
    return r.ok ? { ...r, message: r.message + warn, id: target.creativeId } : r;
  }
  const r = await createCreative(userId, {
    name,
    brandId: spec.brandId,
    campaignId: null,
    assetIds: [stored.asset.id],
    origin: "IA",
    spec: recipe,
    note: `Arte gerada (${ART_FORMATS[spec.format].label})`,
  });
  return r.ok ? { ...r, message: r.message + warn } : r;
}

/** Foto de fundo gerada por IA: fica pronta para usar na arte (ou no carrossel). */
export async function generateBackgroundAsset(
  userId: string,
  prompt: string,
  format: string,
): Promise<{ ok: true; id: string; demo: boolean } | { ok: false; message: string }> {
  if (!(format in ART_FORMATS)) return { ok: false, message: "Formato inválido." };
  if (!imageProviderName())
    return { ok: false, message: "A geração de imagens por IA ainda não foi configurada." };
  if (!(await rateLimit(`mkt-imagem:${userId}`, 20, 60 * 60)))
    return { ok: false, message: "Muitas imagens geradas na última hora. Aguarde um pouco." };
  try {
    const { png, model } = await generateBackground(prompt, format as ArtFormat);
    const stored = await storeGenerated(userId, png, "imagem-ia");
    if (!stored.ok) return stored;
    await audit({
      actorId: userId,
      action: "marketing.image_generated",
      entity: "MediaAsset",
      entityId: stored.asset.id,
      after: { modelo: model, formato: format },
    });
    return { ok: true, id: stored.asset.id, demo: model.startsWith("simulado") };
  } catch (e) {
    if (e instanceof ImageGenError) {
      console.error("imagem-ia", e.detail ?? e.message);
      return { ok: false, message: e.message };
    }
    throw e;
  }
}

// ─── Carrossel (Etapa 3) ─────────────────

export async function saveCarousel(
  userId: string,
  input: Record<string, unknown>,
  target: { creativeId: string | null; name: string; note: string },
): Promise<CreativeResult> {
  const p = parseCarouselSpec(input);
  if (!p.ok) return p;
  if (!(await rateLimit(`mkt-arte:${userId}`, 60, 60 * 60)))
    return { ok: false, message: "Muitas artes geradas na última hora. Aguarde um pouco." };
  const spec: CarouselSpec = p.spec;
  const name = target.creativeId ? "carrossel" : parseCreativeName(target.name);
  if (!name) return { ok: false, message: "Nome do criativo: de 2 a 120 letras." };
  const pages = await renderCarousel(spec, await renderBrand(spec.brandId));
  const ids: string[] = [];
  for (const [i, png] of pages.entries()) {
    const stored = await storeGenerated(userId, png, `${name}-pagina-${i + 1}`);
    if (!stored.ok) return stored;
    ids.push(stored.asset.id);
  }
  await pinBackground(spec.coverAssetId);
  const recipe = { tipo: "carrossel", ...spec } as unknown as Prisma.InputJsonValue;
  const policy = checkAdPolicy(spec.cta, ...spec.pages.flatMap((pg) => [pg.title, pg.text]));
  const warn = policy.length ? ` Atenção: ${policy.map((w) => w.motivo).join(" ")}` : "";
  if (target.creativeId) {
    const r = await addVersion(userId, target.creativeId, {
      assetIds: ids,
      note: target.note || "Carrossel editado",
      spec: recipe,
    });
    return r.ok ? { ...r, message: r.message + warn, id: target.creativeId } : r;
  }
  const r = await createCreative(userId, {
    name,
    brandId: spec.brandId,
    campaignId: null,
    assetIds: ids,
    origin: "IA",
    spec: recipe,
    note: `Carrossel gerado (${pages.length} páginas)`,
  });
  return r.ok ? { ...r, message: r.message + warn } : r;
}

/** Receita guardada de uma versão (para abrir o editor com tudo preenchido). */
export async function versionRecipe(
  creativeId: string,
): Promise<{ tipo: "arte" | "carrossel"; spec: Record<string, unknown>; name: string } | null> {
  const c = await prisma.creative.findFirst({
    where: { id: creativeId },
    include: { versions: { orderBy: { number: "desc" }, take: 1, select: { spec: true } } },
  });
  const spec = c?.versions[0]?.spec as Record<string, unknown> | null | undefined;
  if (!c || !spec || (spec.tipo !== "arte" && spec.tipo !== "carrossel")) return null;
  return { tipo: spec.tipo, spec, name: c.name };
}

/** Dados dos editores: marcas (cores, fontes, chamadas, logomarca) e imagens da biblioteca para fundo. */
export async function editorData() {
  const [brands, images] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        colors: true,
        headingFont: true,
        bodyFont: true,
        ctas: true,
        logoAssetId: true,
      },
    }),
    prisma.mediaAsset.findMany({
      where: {
        status: "PRONTO",
        kind: "IMAGEM",
        OR: [{ purpose: "fundo" }, { version: { creative: { status: { not: "ARQUIVADO" } } } }],
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        originalName: true,
        purpose: true,
        version: { select: { number: true, creative: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      colors: b.colors,
      headingFont: b.headingFont,
      bodyFont: b.bodyFont,
      ctas: b.ctas,
      hasLogo: !!b.logoAssetId,
    })),
    library: images.map((a) => ({
      id: a.id,
      label: a.version ? `${a.version.creative.name} (v${a.version.number})` : `Foto: ${a.originalName}`,
    })),
    imageAi: imageProviderName() !== null,
  };
}
