/**
 * Estúdio IA (Etapa 2): o que vai para a IA, o que volta e a conferência de políticas.
 * Regra de ouro: a IA só usa informações OFICIAIS APROVADAS no kit da marca. Preço, benefício,
 * desconto ou profissional que não estiver lá não pode aparecer no texto.
 */

export const STUDIO_GOALS = {
  vendas: "Vender",
  cadastros: "Gerar cadastros",
  whatsapp: "Conversas no WhatsApp",
  agendamentos: "Agendamentos",
  reconhecimento: "Tornar a marca conhecida",
} as const;
export type StudioGoal = keyof typeof STUDIO_GOALS;

export const STUDIO_TONES = {
  acolhedor: "Acolhedor",
  direto: "Direto e objetivo",
  profissional: "Profissional",
  animado: "Animado",
} as const;
export type StudioTone = keyof typeof STUDIO_TONES;

export const STUDIO_LIMITS = { audience: 300, topic: 500, request: 1500, refine: 600 } as const;

/** Informação oficial aprovada, como vai para a IA. */
export interface StudioFact {
  id: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
}

export interface StudioInput {
  objetivo: StudioGoal;
  tom: StudioTone;
  publico: string;
  assunto: string;
  pedido: string;
  marca: {
    nome: string;
    sobre: string | null;
    site: string | null;
    chamadas: string[];
    fatos: StudioFact[];
  } | null;
  /** Pedido de ajuste sobre um resultado anterior (refinar). */
  ajuste?: { instrucao: string; anterior: StudioOutput };
}

export interface StudioArtIdea {
  titulo: string;
  subtitulo: string;
  chamada: string;
  destaque: string;
  ideia_imagem: string;
}

export interface StudioOutput {
  resumo: string;
  titulos: string[];
  textos: string[];
  chamadas: string[];
  artes: StudioArtIdea[];
  carrossel: { paginas: { titulo: string; texto: string }[]; chamada: string };
  roteiro_video: {
    gancho: string;
    cenas: { tempo: string; fala: string; imagem: string }[];
    chamada: string;
  };
  avisos: string[];
  fatos_usados: string[];
}

const cut = (s: unknown, n: number) =>
  String(s ?? "")
    .trim()
    .slice(0, n);
const list = <T>(v: unknown, max: number, map: (x: unknown) => T, keep: (x: T) => boolean): T[] =>
  (Array.isArray(v) ? v : []).map(map).filter(keep).slice(0, max);

/** Corta tamanhos, limita quantidades e descarta "fatos usados" que não existem no kit. */
export function reviewStudioOutput(out: StudioOutput, input: StudioInput): StudioOutput {
  const known = new Set((input.marca?.fatos ?? []).map((f) => f.id));
  const nonEmpty = (s: string) => s.length > 0;
  return {
    resumo: cut(out.resumo, 600),
    titulos: list(out.titulos, 6, (x) => cut(x, 60), nonEmpty),
    textos: list(out.textos, 4, (x) => cut(x, 700), nonEmpty),
    chamadas: list(out.chamadas, 5, (x) => cut(x, 32), nonEmpty),
    artes: list(
      out.artes,
      4,
      (x) => {
        const a = (x ?? {}) as Partial<StudioArtIdea>;
        return {
          titulo: cut(a.titulo, 90),
          subtitulo: cut(a.subtitulo, 180),
          chamada: cut(a.chamada, 32),
          destaque: cut(a.destaque, 40),
          ideia_imagem: cut(a.ideia_imagem, 600),
        };
      },
      (a) => a.titulo.length > 0,
    ),
    carrossel: {
      paginas: list(
        out.carrossel?.paginas,
        10,
        (x) => {
          const p = (x ?? {}) as { titulo?: string; texto?: string };
          return { titulo: cut(p.titulo, 80), texto: cut(p.texto, 280) };
        },
        (p) => p.titulo.length > 0 || p.texto.length > 0,
      ),
      chamada: cut(out.carrossel?.chamada, 32),
    },
    roteiro_video: {
      gancho: cut(out.roteiro_video?.gancho, 200),
      cenas: list(
        out.roteiro_video?.cenas,
        10,
        (x) => {
          const c = (x ?? {}) as { tempo?: string; fala?: string; imagem?: string };
          return { tempo: cut(c.tempo, 20), fala: cut(c.fala, 300), imagem: cut(c.imagem, 300) };
        },
        (c) => c.fala.length > 0 || c.imagem.length > 0,
      ),
      chamada: cut(out.roteiro_video?.chamada, 60),
    },
    avisos: list(out.avisos, 8, (x) => cut(x, 300), nonEmpty),
    fatos_usados: list(
      out.fatos_usados,
      30,
      (x) => String(x ?? ""),
      (id) => known.has(id),
    ),
  };
}

// ─── Conferência de políticas (Meta e saúde) ─────────────────

export interface PolicyWarning {
  trecho: string;
  motivo: string;
}

/**
 * Sinais de texto que a Meta costuma recusar, principalmente em saúde: promessa de cura ou resultado
 * garantido, "antes e depois", e frases que afirmam algo pessoal sobre quem lê ("você tem diabetes?").
 * É um ALERTA para a pessoa revisar — a decisão final é humana.
 */
const RULES: { re: RegExp; motivo: string }[] = [
  { re: /\bcur(a|ar|e|ou|amos)\b/i, motivo: "Promessa de cura não é permitida em anúncios de saúde." },
  { re: /\bgaranti(do|da|mos|a|r)\b|\bresultado garantido\b/i, motivo: "Evite garantir resultados." },
  { re: /\b100\s?%/i, motivo: "Percentuais absolutos (100%) costumam ser vistos como promessa enganosa." },
  { re: /\bsem (nenhum )?risco/i, motivo: "Não afirme que algo é sem riscos." },
  { re: /\bmilagr/i, motivo: "Termos milagrosos são recusados pela Meta." },
  { re: /\bantes e depois\b/i, motivo: "Imagens ou textos de antes e depois são restritos em saúde." },
  { re: /\bperca \d+\s?(kg|quilos)/i, motivo: "Promessa de perda de peso com número é proibida." },
  {
    re: /\bvocê (tem|sofre de|está com|é portador)\b/i,
    motivo: "A Meta proíbe afirmar ou insinuar características pessoais de quem lê (saúde, por exemplo).",
  },
  {
    re: /\b(seu|sua) (diabetes|depressão|ansiedade|doença|obesidade|câncer|pressão alta)\b/i,
    motivo: "Não se refira a condição de saúde de quem lê.",
  },
  {
    re: /\bo melhor (do|da) (brasil|mundo|cidade)\b/i,
    motivo: "Superlativos sem comprovação podem ser recusados.",
  },
  { re: /\bdepoimento\b/i, motivo: "Depoimentos só com autorização da pessoa e sem prometer resultado." },
];

export function checkAdPolicy(...texts: string[]): PolicyWarning[] {
  const out: PolicyWarning[] = [];
  const seen = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const r of RULES) {
      const m = r.re.exec(t);
      if (m && !seen.has(r.motivo)) {
        seen.add(r.motivo);
        out.push({ trecho: m[0], motivo: r.motivo });
      }
    }
  }
  return out;
}

/** Todos os textos de um resultado do Estúdio, para conferir as políticas de uma vez. */
export function studioTexts(o: StudioOutput): string[] {
  return [
    ...o.titulos,
    ...o.textos,
    ...o.chamadas,
    ...o.artes.flatMap((a) => [a.titulo, a.subtitulo, a.chamada, a.destaque]),
    ...o.carrossel.paginas.flatMap((p) => [p.titulo, p.texto]),
    o.roteiro_video.gancho,
    ...o.roteiro_video.cenas.map((c) => c.fala),
  ];
}

/** Preço/valor em reais citado no texto que NÃO aparece em nenhuma informação aprovada. */
export function unapprovedPrices(texts: string[], facts: StudioFact[]): string[] {
  const allowed = facts
    .map((f) => `${f.titulo} ${f.detalhe ?? ""}`)
    .join(" ")
    .replace(/\s+/g, "");
  const found = new Set<string>();
  for (const t of texts)
    for (const m of t.matchAll(/R\$\s?\d[\d.]*(,\d{2})?/g)) {
      const v = m[0].replace(/\s+/g, "");
      if (!allowed.includes(v)) found.add(m[0]);
    }
  return [...found];
}
