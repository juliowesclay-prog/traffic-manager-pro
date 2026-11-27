/**
 * Enviar para Meta (Etapa 6): regras puras do anúncio montado a partir de um criativo aprovado.
 * O anúncio SEMPRE nasce PAUSADO; ativar é decisão humana, no Gerenciador de Anúncios ou pelas
 * ações com aprovação do Gestor de Tráfego.
 */

export const META_CTAS = {
  LEARN_MORE: "Saiba mais",
  SIGN_UP: "Cadastre-se",
  CONTACT_US: "Fale conosco",
  GET_QUOTE: "Pedir orçamento",
  SHOP_NOW: "Comprar agora",
  SUBSCRIBE: "Assinar",
  APPLY_NOW: "Candidate-se",
} as const;
export type MetaCta = keyof typeof META_CTAS;

export const META_AD_LIMITS = {
  name: 120,
  primaryText: 2000,
  headline: 255,
  description: 255,
  link: 1000,
} as const;

export interface MetaSubmissionInput {
  adSetId: string;
  pageId: string;
  instagramId: string | null;
  adName: string;
  primaryText: string;
  headline: string;
  description: string;
  link: string;
  callToAction: MetaCta;
}

const clean = (v: unknown, n: number) =>
  String(v ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, n);

export function parseMetaSubmission(
  input: Record<string, unknown>,
): { ok: true; value: MetaSubmissionInput } | { ok: false; message: string } {
  const adSetId = String(input.adSetId ?? "");
  if (!/^\d{1,30}$/.test(adSetId)) return { ok: false, message: "Escolha o conjunto de anúncios." };
  const pageId = String(input.pageId ?? "").trim();
  if (!/^\d{1,30}$/.test(pageId))
    return { ok: false, message: "Escolha a página do Facebook que assina o anúncio." };
  const ig = String(input.instagramId ?? "").trim();
  const adName = clean(input.adName, META_AD_LIMITS.name);
  if (adName.length < 2) return { ok: false, message: "Dê um nome para o anúncio." };
  const primaryText = clean(input.primaryText, META_AD_LIMITS.primaryText);
  if (primaryText.length < 5) return { ok: false, message: "Escreva o texto principal do anúncio." };
  const headline = clean(input.headline, META_AD_LIMITS.headline).replace(/\n/g, " ");
  if (headline.length < 2) return { ok: false, message: "Escreva o título do anúncio." };
  let link: URL;
  try {
    link = new URL(String(input.link ?? "").trim());
  } catch {
    return { ok: false, message: "Link de destino inválido (use https://...)." };
  }
  if (link.protocol !== "https:" || link.toString().length > META_AD_LIMITS.link)
    return { ok: false, message: "O link de destino precisa começar com https://." };
  const cta = String(input.callToAction ?? "LEARN_MORE");
  if (!(cta in META_CTAS)) return { ok: false, message: "Chamada para ação inválida." };
  return {
    ok: true,
    value: {
      adSetId,
      pageId,
      instagramId: /^\d{1,30}$/.test(ig) ? ig : null,
      adName,
      primaryText,
      headline,
      description: clean(input.description, META_AD_LIMITS.description).replace(/\n/g, " "),
      link: link.toString(),
      callToAction: cta as MetaCta,
    },
  };
}

export type MetaCreativeMedia =
  | { kind: "IMAGEM"; imageHash: string }
  | { kind: "CARROSSEL"; imageHashes: string[] }
  | { kind: "VIDEO"; videoId: string; thumbnailUrl: string };

/** object_story_spec do criativo da Meta (imagem, carrossel ou vídeo). */
export function buildObjectStorySpec(
  s: MetaSubmissionInput,
  media: MetaCreativeMedia,
): Record<string, unknown> {
  const cta = { type: s.callToAction, value: { link: s.link } };
  const identity: Record<string, unknown> = {
    page_id: s.pageId,
    ...(s.instagramId ? { instagram_user_id: s.instagramId } : {}),
  };
  if (media.kind === "VIDEO")
    return {
      ...identity,
      video_data: {
        video_id: media.videoId,
        image_url: media.thumbnailUrl,
        message: s.primaryText,
        title: s.headline,
        ...(s.description ? { link_description: s.description } : {}),
        call_to_action: cta,
      },
    };
  if (media.kind === "CARROSSEL")
    return {
      ...identity,
      link_data: {
        link: s.link,
        message: s.primaryText,
        multi_share_optimized: true,
        multi_share_end_card: false,
        child_attachments: media.imageHashes.map((h) => ({
          link: s.link,
          image_hash: h,
          name: s.headline,
          ...(s.description ? { description: s.description } : {}),
          call_to_action: cta,
        })),
      },
    };
  return {
    ...identity,
    link_data: {
      link: s.link,
      image_hash: media.imageHash,
      message: s.primaryText,
      name: s.headline,
      ...(s.description ? { description: s.description } : {}),
      call_to_action: cta,
    },
  };
}
