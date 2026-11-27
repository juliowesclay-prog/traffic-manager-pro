/**
 * Módulo Marketing — regras puras (Etapa 1: biblioteca de criativos, arquivos e kit da marca).
 * Tudo aqui é conferido de novo no servidor e, quando possível, por travas no banco.
 */
import { can, type Role } from "./rbac";

export const CREATIVE_KINDS = ["IMAGEM", "CARROSSEL", "VIDEO"] as const;
export type CreativeKind = (typeof CREATIVE_KINDS)[number];
export const CREATIVE_KIND_LABELS: Record<CreativeKind, string> = {
  IMAGEM: "Imagem",
  CARROSSEL: "Carrossel",
  VIDEO: "Vídeo",
};

export const CREATIVE_STATUSES = [
  "RASCUNHO",
  "EM_EDICAO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "ENVIADO_META",
  "ARQUIVADO",
] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];
export const CREATIVE_STATUS_LABELS: Record<CreativeStatus, string> = {
  RASCUNHO: "Rascunho",
  EM_EDICAO: "Em edição",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  ENVIADO_META: "Enviado para Meta",
  ARQUIVADO: "Arquivado",
};

export const CREATIVE_ORIGIN_LABELS = { IMPORTADO: "Importado", IA: "Criado com IA", CANVA: "Canva" } as const;

/**
 * Pode mudar o status do criativo para `to`?
 * - "Enviado para Meta" só é marcado pelo envio real (Etapa 6), nunca à mão.
 * - Aprovar exige a permissão de aprovação. Criativo já enviado à Meta só pode ser arquivado.
 */
export function creativeStatusChange(
  roles: readonly Role[],
  from: CreativeStatus,
  to: CreativeStatus,
): { ok: true } | { ok: false; message: string } {
  if (from === to) return { ok: false, message: "O criativo já está com esse status." };
  if (!can(roles, "marketing:manage")) return { ok: false, message: "Seu perfil não altera criativos." };
  if (to === "ENVIADO_META")
    return { ok: false, message: "Esse status é marcado automaticamente quando o envio à Meta der certo." };
  if (from === "ENVIADO_META" && to !== "ARQUIVADO")
    return { ok: false, message: "Criativo já enviado à Meta só pode ser arquivado. Duplique para criar outro." };
  if (to === "APROVADO" && !can(roles, "marketing:approve"))
    return { ok: false, message: "Só o Gestor ou o Superadministrador aprovam criativos." };
  return { ok: true };
}

/** Status que a pessoa pode escolher à mão, conforme o perfil e o status atual. */
export function manualStatusOptions(roles: readonly Role[], from: CreativeStatus): CreativeStatus[] {
  return CREATIVE_STATUSES.filter((to) => to !== from && creativeStatusChange(roles, from, to).ok);
}

// ─── Arquivos ─────────────────

export const MB = 1024 * 1024;
export const MEDIA_LIMITS = {
  imageMaxBytes: 20 * MB,
  logoMaxBytes: 5 * MB,
  videoMaxBytes: 500 * MB,
  videoMaxMs: 10 * 60 * 1000,
  imageMinSide: 200,
  imageMaxSide: 12000,
  carouselMin: 2,
  carouselMax: 10,
  /** Espaço total por empresa (todos os arquivos prontos). */
  companyQuotaBytes: 20 * 1024 * MB,
} as const;

export type UploadPurpose = "criativo" | "logo";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

/** Primeira conferência (antes do envio), com o que o navegador informa. A definitiva é pelo conteúdo. */
export function checkDeclaredUpload(
  purpose: UploadPurpose,
  type: string,
  size: number,
): { ok: true; kind: "IMAGEM" | "VIDEO" } | { ok: false; message: string } {
  const isImage = IMAGE_TYPES.includes(type);
  const isVideo = VIDEO_TYPES.includes(type);
  if (purpose === "logo" && !isImage) return { ok: false, message: "A logomarca deve ser PNG, JPG ou WEBP." };
  if (!isImage && !isVideo)
    return { ok: false, message: "Formato não aceito. Envie PNG, JPG, WEBP, MP4 ou MOV." };
  if (!Number.isSafeInteger(size) || size <= 0) return { ok: false, message: "Arquivo vazio." };
  const max = purpose === "logo" ? MEDIA_LIMITS.logoMaxBytes : isImage ? MEDIA_LIMITS.imageMaxBytes : MEDIA_LIMITS.videoMaxBytes;
  if (size > max) return { ok: false, message: `Arquivo grande demais (máximo ${Math.round(max / MB)} MB).` };
  return { ok: true, kind: isImage ? "IMAGEM" : "VIDEO" };
}

/** Conferência final, com as medidas lidas do próprio arquivo. */
export function checkProbedMedia(
  purpose: UploadPurpose,
  m: { kind: "IMAGEM" | "VIDEO"; width: number; height: number; durationMs?: number },
  size: number,
): { ok: true } | { ok: false; message: string } {
  if (purpose === "logo" && m.kind !== "IMAGEM") return { ok: false, message: "A logomarca deve ser uma imagem." };
  const max = purpose === "logo" ? MEDIA_LIMITS.logoMaxBytes : m.kind === "IMAGEM" ? MEDIA_LIMITS.imageMaxBytes : MEDIA_LIMITS.videoMaxBytes;
  if (size > max) return { ok: false, message: `Arquivo grande demais (máximo ${Math.round(max / MB)} MB).` };
  if (m.kind === "IMAGEM") {
    const minSide = purpose === "logo" ? 64 : MEDIA_LIMITS.imageMinSide;
    if (Math.min(m.width, m.height) < minSide)
      return { ok: false, message: `Imagem pequena demais (mínimo ${minSide} px no menor lado).` };
    if (Math.max(m.width, m.height) > MEDIA_LIMITS.imageMaxSide)
      return { ok: false, message: `Imagem grande demais (máximo ${MEDIA_LIMITS.imageMaxSide} px).` };
  } else if ((m.durationMs ?? 0) > MEDIA_LIMITS.videoMaxMs) {
    return { ok: false, message: "Vídeo longo demais (máximo 10 minutos)." };
  }
  return { ok: true };
}

/** Tipo do criativo pelos arquivos: 1 imagem, 2 a 10 imagens (carrossel) ou 1 vídeo. */
export function creativeKindFor(
  kinds: readonly ("IMAGEM" | "VIDEO")[],
): { ok: true; kind: CreativeKind } | { ok: false; message: string } {
  if (!kinds.length) return { ok: false, message: "Envie ao menos um arquivo." };
  const videos = kinds.filter((k) => k === "VIDEO").length;
  if (videos > 0) {
    if (kinds.length > 1) return { ok: false, message: "Vídeo vai sozinho: envie um vídeo por criativo." };
    return { ok: true, kind: "VIDEO" };
  }
  if (kinds.length === 1) return { ok: true, kind: "IMAGEM" };
  if (kinds.length > MEDIA_LIMITS.carouselMax)
    return { ok: false, message: `Carrossel tem no máximo ${MEDIA_LIMITS.carouselMax} imagens.` };
  return { ok: true, kind: "CARROSSEL" };
}

/** Uma versão nova precisa manter o tipo do criativo (imagem continua imagem etc.). */
export function versionMatchesKind(kind: CreativeKind, newKind: CreativeKind): boolean {
  return kind === newKind;
}

/** Proporção legível (1:1, 4:5, 9:16, 16:9…) e o formato da Meta mais próximo. */
export function aspectLabel(width: number, height: number): string {
  if (!width || !height) return "—";
  const r = width / height;
  const known: [number, string][] = [
    [1, "1:1 (feed quadrado)"],
    [4 / 5, "4:5 (feed vertical)"],
    [9 / 16, "9:16 (Stories e Reels)"],
    [16 / 9, "16:9 (horizontal)"],
    [1.91, "1,91:1 (link)"],
  ];
  const near = known.find(([k]) => Math.abs(r - k) / k < 0.03);
  return near ? near[1] : `${width}×${height}`;
}

export const formatBytes = (n: number) =>
  n >= MB ? `${(n / MB).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const formatDuration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ─── Kit da marca ─────────────────

export const BRAND_FACT_KINDS = ["PRODUTO", "SERVICO", "BENEFICIO", "DIFERENCIAL", "PRECO", "INSTITUCIONAL"] as const;
export type BrandFactKind = (typeof BRAND_FACT_KINDS)[number];
export const BRAND_FACT_KIND_LABELS: Record<BrandFactKind, string> = {
  PRODUTO: "Produto",
  SERVICO: "Serviço",
  BENEFICIO: "Benefício",
  DIFERENCIAL: "Diferencial",
  PRECO: "Preço ou condição comercial",
  INSTITUCIONAL: "Informação institucional",
};

/** Fontes oferecidas (todas gratuitas para uso comercial, Google Fonts / SIL OFL). */
export const BRAND_FONTS = [
  "Inter",
  "Sora",
  "Montserrat",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Nunito",
  "Raleway",
  "Playfair Display",
  "Merriweather",
  "Atkinson Hyperlegible",
] as const;

export const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "youtube", "linkedin", "whatsapp"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp (link wa.me)",
};

/** Cores: aceita "#abc", "abc", "#aabbcc"; devolve "#AABBCC" ou null. */
export function normalizeHexColor(input: string): string | null {
  const v = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v))
    return `#${v
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase()}`;
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

/** Endereço web seguro (só http/https). Aceita sem "https://" e acrescenta. */
export function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export interface BrandInput {
  name: string;
  website?: string;
  about?: string;
  colors: string[];
  headingFont?: string;
  bodyFont?: string;
  ctas: string[];
  socials: Partial<Record<SocialNetwork, string>>;
}

export type BrandParsed = {
  name: string;
  website: string | null;
  about: string | null;
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  ctas: string[];
  socials: Partial<Record<SocialNetwork, string>>;
};

/** Valida e normaliza o kit da marca. Erros em português, campo a campo. */
export function parseBrand(input: BrandInput): { ok: true; value: BrandParsed } | { ok: false; message: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Nome da marca: de 2 a 80 letras." };
  let website: string | null = null;
  if (input.website?.trim()) {
    website = normalizeUrl(input.website);
    if (!website) return { ok: false, message: "Site inválido. Exemplo: https://www.suaempresa.com.br" };
  }
  const about = input.about?.trim().slice(0, 4000) || null;
  const colors: string[] = [];
  for (const c of input.colors.filter((c) => c.trim())) {
    const hex = normalizeHexColor(c);
    if (!hex) return { ok: false, message: `Cor inválida: "${c}". Use o formato #RRGGBB.` };
    if (!colors.includes(hex)) colors.push(hex);
  }
  if (colors.length > 8) return { ok: false, message: "No máximo 8 cores." };
  const font = (f?: string) => (f && (BRAND_FONTS as readonly string[]).includes(f) ? f : null);
  if (input.headingFont && !font(input.headingFont)) return { ok: false, message: "Fonte dos títulos inválida." };
  if (input.bodyFont && !font(input.bodyFont)) return { ok: false, message: "Fonte dos textos inválida." };
  const ctas = [...new Set(input.ctas.map((c) => c.trim().replace(/\s+/g, " ")).filter(Boolean))];
  if (ctas.length > 8) return { ok: false, message: "No máximo 8 chamadas para ação." };
  if (ctas.some((c) => c.length > 60)) return { ok: false, message: "Cada chamada para ação: até 60 letras." };
  const socials: Partial<Record<SocialNetwork, string>> = {};
  for (const net of SOCIAL_NETWORKS) {
    const raw = input.socials[net]?.trim();
    if (!raw) continue;
    const url = normalizeUrl(raw);
    if (!url) return { ok: false, message: `${SOCIAL_LABELS[net]}: endereço inválido.` };
    socials[net] = url;
  }
  return {
    ok: true,
    value: { name, website, about, colors, headingFont: font(input.headingFont), bodyFont: font(input.bodyFont), ctas, socials },
  };
}

/** Nome de criativo: 2 a 120 letras, espaços normalizados. */
export function parseCreativeName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 120 ? name : null;
}

/** Nome para download (sem caracteres que quebram o cabeçalho ou o sistema de arquivos). */
export function safeFileName(base: string, ext: string): string {
  const clean =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._ -]+/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^[.-]+/, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "arquivo";
  return `${clean}.${ext}`;
}
