/**
 * Artes e carrosséis do Marketing (Etapas 2 e 3): formatos, modelos e conferência do que a pessoa
 * (ou a IA) preencheu. Puro (sem servidor), usado pelas telas, pelo servidor e pelos testes.
 * A arte é desenhada no servidor a partir desta "receita" (spec), que fica guardada na versão do
 * criativo: assim dá para editar e gerar uma versão nova sem perder a anterior.
 */
import { BRAND_FONTS, normalizeHexColor } from "./marketing";

export const ART_FORMATS = {
  quadrado: { width: 1080, height: 1080, label: "Feed quadrado (1:1)" },
  retrato: { width: 1080, height: 1350, label: "Feed vertical (4:5)" },
  stories: { width: 1080, height: 1920, label: "Stories e Reels (9:16)" },
} as const;
export type ArtFormat = keyof typeof ART_FORMATS;
export const ART_FORMAT_KEYS = Object.keys(ART_FORMATS) as ArtFormat[];

export const ART_TEMPLATES = {
  destaque: "Foto inteira com texto embaixo",
  faixa: "Faixa colorida com título e foto",
  texto: "Só texto, fundo nas cores da marca",
  oferta: "Destaque de condição (ex.: preço aprovado)",
} as const;
export type ArtTemplate = keyof typeof ART_TEMPLATES;
export const ART_TEMPLATE_KEYS = Object.keys(ART_TEMPLATES) as ArtTemplate[];

export const LOGO_POSITIONS = {
  "topo-esquerda": "No alto, à esquerda",
  "topo-direita": "No alto, à direita",
  rodape: "No rodapé",
} as const;
export type LogoPosition = keyof typeof LOGO_POSITIONS;

export const ART_LIMITS = { title: 90, subtitle: 180, cta: 32, highlight: 40, name: 120 } as const;

export interface ArtColors {
  /** Fundo / cor principal. */
  primary: string;
  /** Destaques (botão, faixa). */
  accent: string;
}

export interface ArtSpec {
  format: ArtFormat;
  template: ArtTemplate;
  title: string;
  subtitle: string;
  cta: string;
  highlight: string;
  brandId: string | null;
  /** Foto de fundo (arquivo da biblioteca/envio) — opcional. */
  backgroundAssetId: string | null;
  showLogo: boolean;
  logoPosition: LogoPosition;
  colors: ArtColors;
  headingFont: string;
  bodyFont: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Remove caracteres de controle (exceto quebra de linha e tab), que quebram o desenho do texto.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(CONTROL, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
const font = (v: unknown, fallback: string) =>
  (BRAND_FONTS as readonly string[]).includes(String(v)) ? String(v) : fallback;
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

export const DEFAULT_ART_COLORS: ArtColors = { primary: "#1E3A8A", accent: "#F59E0B" };

/** Confere e normaliza uma receita de arte. Textos longos são cortados; formatos e fontes inválidos, recusados. */
export function parseArtSpec(
  input: Record<string, unknown>,
): { ok: true; spec: ArtSpec } | { ok: false; message: string } {
  const format = String(input.format ?? "");
  if (!(format in ART_FORMATS)) return { ok: false, message: "Escolha o formato da arte." };
  const template = String(input.template ?? "");
  if (!(template in ART_TEMPLATES)) return { ok: false, message: "Escolha o modelo da arte." };
  const title = clean(input.title, ART_LIMITS.title);
  if (!title) return { ok: false, message: "Escreva o título da arte." };
  const colorsIn = (input.colors ?? {}) as Record<string, unknown>;
  const primary = normalizeHexColor(String(colorsIn.primary ?? "")) ?? DEFAULT_ART_COLORS.primary;
  const accent = normalizeHexColor(String(colorsIn.accent ?? "")) ?? DEFAULT_ART_COLORS.accent;
  const logoPosition = String(input.logoPosition ?? "topo-esquerda");
  return {
    ok: true,
    spec: {
      format: format as ArtFormat,
      template: template as ArtTemplate,
      title,
      subtitle: clean(input.subtitle, ART_LIMITS.subtitle),
      cta: clean(input.cta, ART_LIMITS.cta),
      highlight: template === "oferta" ? clean(input.highlight, ART_LIMITS.highlight) : "",
      brandId: id(input.brandId),
      backgroundAssetId: id(input.backgroundAssetId),
      showLogo: input.showLogo === true || input.showLogo === "true" || input.showLogo === "on",
      logoPosition: (logoPosition in LOGO_POSITIONS ? logoPosition : "topo-esquerda") as LogoPosition,
      colors: { primary, accent },
      headingFont: font(input.headingFont, "Sora"),
      bodyFont: font(input.bodyFont, "Inter"),
    },
  };
}

// ─── Carrossel (Etapa 3) ─────────────────

export const CAROUSEL_FORMATS = ["quadrado", "retrato"] as const satisfies readonly ArtFormat[];
export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number];
export const CAROUSEL_LIMITS = { minPages: 2, maxPages: 10, title: 80, text: 280 } as const;

export interface CarouselPage {
  title: string;
  text: string;
}

export interface CarouselSpec {
  format: CarouselFormat;
  pages: CarouselPage[];
  /** Chamada final (última página). */
  cta: string;
  brandId: string | null;
  /** Foto da capa (primeira página) — opcional. */
  coverAssetId: string | null;
  showLogo: boolean;
  colors: ArtColors;
  headingFont: string;
  bodyFont: string;
}

export function parseCarouselSpec(
  input: Record<string, unknown>,
): { ok: true; spec: CarouselSpec } | { ok: false; message: string } {
  const format = String(input.format ?? "");
  if (!(CAROUSEL_FORMATS as readonly string[]).includes(format))
    return { ok: false, message: "Escolha o formato do carrossel." };
  const raw = Array.isArray(input.pages) ? (input.pages as Record<string, unknown>[]) : [];
  const pages = raw
    .map((p) => ({
      title: clean(p?.title, CAROUSEL_LIMITS.title),
      text: clean(p?.text, CAROUSEL_LIMITS.text),
    }))
    .filter((p) => p.title || p.text);
  if (pages.length < CAROUSEL_LIMITS.minPages || pages.length > CAROUSEL_LIMITS.maxPages)
    return {
      ok: false,
      message: `O carrossel precisa ter de ${CAROUSEL_LIMITS.minPages} a ${CAROUSEL_LIMITS.maxPages} páginas preenchidas.`,
    };
  if (!pages[0]!.title) return { ok: false, message: "A primeira página (capa) precisa de um título." };
  const colorsIn = (input.colors ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    spec: {
      format: format as CarouselFormat,
      pages,
      cta: clean(input.cta, ART_LIMITS.cta),
      brandId: id(input.brandId),
      coverAssetId: id(input.coverAssetId),
      showLogo: input.showLogo === true || input.showLogo === "true" || input.showLogo === "on",
      colors: {
        primary: normalizeHexColor(String(colorsIn.primary ?? "")) ?? DEFAULT_ART_COLORS.primary,
        accent: normalizeHexColor(String(colorsIn.accent ?? "")) ?? DEFAULT_ART_COLORS.accent,
      },
      headingFont: font(input.headingFont, "Sora"),
      bodyFont: font(input.bodyFont, "Inter"),
    },
  };
}

// ─── Cores e fontes ─────────────────

/** Luminância relativa (WCAG) de #RRGGBB. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Cor de texto legível sobre um fundo: branco ou quase preto (o que tiver mais contraste). */
export const readableOn = (bg: string) =>
  contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#111827") ? "#FFFFFF" : "#111827";

/** Nome do arquivo da fonte (assets/fonts/<slug>-latin-<peso>-normal.woff). */
export const fontSlug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

/** Texto que cabe: reduz a fonte conforme o tamanho do título (aproximação simples, sem medir). */
export function fitFontSize(text: string, base: number, min: number, charsAtBase: number): number {
  if (text.length <= charsAtBase) return base;
  return Math.max(min, Math.round(base * Math.sqrt(charsAtBase / text.length)));
}
