/**
 * Editor de vídeos (Etapa 4): o plano da edição e a montagem do comando do FFmpeg, tudo puro e testável.
 * O servidor confere o plano; o servidor de vídeo (fora da Vercel, com FFmpeg) só executa.
 */

export const VIDEO_FORMATS = {
  "9:16": { width: 1080, height: 1920, label: "Vertical 9:16 (Reels, Stories, TikTok)" },
  "4:5": { width: 1080, height: 1350, label: "Feed vertical 4:5" },
  "1:1": { width: 1080, height: 1080, label: "Quadrado 1:1" },
  "16:9": { width: 1920, height: 1080, label: "Horizontal 16:9 (YouTube)" },
} as const;
export type VideoFormat = keyof typeof VIDEO_FORMATS;
export const VIDEO_FORMAT_KEYS = Object.keys(VIDEO_FORMATS) as VideoFormat[];

export const VIDEO_FITS = {
  cortar: "Preencher a tela (corta as bordas)",
  desfocado: "Mostrar o vídeo inteiro com fundo desfocado",
} as const;
export type VideoFit = keyof typeof VIDEO_FITS;

export const VIDEO_LOGO_POSITIONS = {
  "topo-esquerda": "No alto, à esquerda",
  "topo-direita": "No alto, à direita",
  "rodape-direita": "Embaixo, à direita",
} as const;
export type VideoLogoPosition = keyof typeof VIDEO_LOGO_POSITIONS;

export const CAPTION_POSITIONS = { baixo: "Embaixo", meio: "No meio" } as const;
export type CaptionPosition = keyof typeof CAPTION_POSITIONS;

export const VIDEO_LIMITS = {
  minOutputMs: 1000,
  maxSegments: 400,
  captionChars: 120,
  endCardText: 60,
  endCardMin: 2,
  endCardMax: 6,
  name: 120,
} as const;

export interface CaptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface VideoEditSpec {
  name: string;
  brandId: string | null;
  trim: { startMs: number; endMs: number | null };
  removeSilence: boolean;
  formats: VideoFormat[];
  fit: VideoFit;
  captions: { enabled: boolean; segments: CaptionSegment[]; position: CaptionPosition; font: string };
  logo: { enabled: boolean; position: VideoLogoPosition };
  endCard: {
    enabled: boolean;
    title: string;
    cta: string;
    seconds: number;
    background: string;
    accent: string;
    font: string;
  };
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const clean = (v: unknown, n: number) =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
const hex = (v: unknown, d: string) => (/^#[0-9A-F]{6}$/i.test(String(v)) ? String(v).toUpperCase() : d);

export function parseVideoSpec(
  input: Record<string, unknown>,
  sourceDurationMs: number,
  fonts: readonly string[],
): { ok: true; spec: VideoEditSpec } | { ok: false; message: string } {
  const name = clean(input.name, VIDEO_LIMITS.name);
  if (name.length < 2) return { ok: false, message: "Dê um nome para os vídeos gerados." };
  const formats = [...new Set((Array.isArray(input.formats) ? input.formats : []).map(String))].filter(
    (f): f is VideoFormat => f in VIDEO_FORMATS,
  );
  if (!formats.length) return { ok: false, message: "Escolha pelo menos um formato." };
  const trimIn = (input.trim ?? {}) as Record<string, unknown>;
  const startMs = Math.max(0, Math.round(num(trimIn.startMs) || 0));
  const rawEnd = trimIn.endMs == null || trimIn.endMs === "" ? null : Math.round(num(trimIn.endMs));
  const endMs = rawEnd == null || !Number.isFinite(rawEnd) || rawEnd >= sourceDurationMs ? null : rawEnd;
  if (startMs >= (endMs ?? sourceDurationMs))
    return { ok: false, message: "O início do corte precisa ser antes do fim." };
  if ((endMs ?? sourceDurationMs) - startMs < VIDEO_LIMITS.minOutputMs)
    return { ok: false, message: "O trecho escolhido precisa ter pelo menos 1 segundo." };
  const fit = String(input.fit ?? "cortar");
  const cap = (input.captions ?? {}) as Record<string, unknown>;
  const segments = (Array.isArray(cap.segments) ? cap.segments : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        startMs: Math.round(num(o.startMs)),
        endMs: Math.round(num(o.endMs)),
        text: clean(o.text, VIDEO_LIMITS.captionChars),
      };
    })
    .filter(
      (s) =>
        Number.isFinite(s.startMs) &&
        Number.isFinite(s.endMs) &&
        s.endMs > s.startMs &&
        s.startMs >= 0 &&
        s.text,
    )
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, VIDEO_LIMITS.maxSegments);
  const captionsEnabled = cap.enabled === true;
  if (captionsEnabled && !segments.length)
    return { ok: false, message: "Para colocar legendas, preencha ou transcreva o texto." };
  const logo = (input.logo ?? {}) as Record<string, unknown>;
  const end = (input.endCard ?? {}) as Record<string, unknown>;
  const endEnabled = end.enabled === true;
  const endTitle = clean(end.title, VIDEO_LIMITS.endCardText);
  if (endEnabled && !endTitle) return { ok: false, message: "Escreva o texto do encerramento." };
  const font = (v: unknown) => (fonts.includes(String(v)) ? String(v) : "Inter");
  const brandId =
    typeof input.brandId === "string" && /^[0-9a-f-]{36}$/i.test(input.brandId) ? input.brandId : null;
  return {
    ok: true,
    spec: {
      name,
      brandId,
      trim: { startMs, endMs },
      removeSilence: input.removeSilence === true,
      formats,
      fit: (fit in VIDEO_FITS ? fit : "cortar") as VideoFit,
      captions: {
        enabled: captionsEnabled,
        segments: captionsEnabled ? segments : [],
        position: (String(cap.position) in CAPTION_POSITIONS
          ? String(cap.position)
          : "baixo") as CaptionPosition,
        font: font(cap.font),
      },
      logo: {
        enabled: logo.enabled === true,
        position: (String(logo.position) in VIDEO_LOGO_POSITIONS
          ? String(logo.position)
          : "topo-direita") as VideoLogoPosition,
      },
      endCard: {
        enabled: endEnabled,
        title: endTitle,
        cta: clean(end.cta, 32),
        seconds: Math.min(
          VIDEO_LIMITS.endCardMax,
          Math.max(VIDEO_LIMITS.endCardMin, Math.round(num(end.seconds) || 3)),
        ),
        background: hex(end.background, "#1E3A8A"),
        accent: hex(end.accent, "#F59E0B"),
        font: font(end.font),
      },
    },
  };
}

// ─── Legendas digitadas ─────────────────

const fmt = (ms: number) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};
const parseClock = (t: string): number | null => {
  const m = /^(?:(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(t.trim());
  if (!m) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + frac;
};

/** "00:01.2 - 00:03.8 Texto" por linha (formato fácil de revisar na tela). */
export const formatCaptionLines = (segs: CaptionSegment[]) =>
  segs.map((s) => `${fmt(s.startMs)} - ${fmt(s.endMs)} ${s.text}`).join("\n");

export function parseCaptionLines(
  text: string,
): { ok: true; segments: CaptionSegment[] } | { ok: false; message: string } {
  const segments: CaptionSegment[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([\d:.,]+)\s*(?:-|–|-->)\s*([\d:.,]+)\s+(.+)$/.exec(line);
    const a = m ? parseClock(m[1]!) : null;
    const b = m ? parseClock(m[2]!) : null;
    if (!m || a == null || b == null || b <= a)
      return {
        ok: false,
        message: `Linha ${i + 1} da legenda: use "00:01.0 - 00:03.5 texto" (início antes do fim).`,
      };
    segments.push({ startMs: a, endMs: b, text: m[3]!.trim().slice(0, VIDEO_LIMITS.captionChars) });
  }
  return { ok: true, segments };
}

// ─── Cortes ─────────────────

/** Trechos de silêncio do `silencedetect` do FFmpeg (em ms). */
export function parseSilences(stderr: string): { startMs: number; endMs: number }[] {
  const out: { startMs: number; endMs: number }[] = [];
  let start: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Math.round(Number(s[1]) * 1000));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && start != null) {
      out.push({ startMs: start, endMs: Math.round(Number(e[1]) * 1000) });
      start = null;
    }
  }
  return out;
}

/**
 * Trechos que ficam no vídeo final: o corte escolhido menos os silêncios (deixando 150 ms de folga
 * em cada lado para a fala não ficar "comida"). Trechos menores que 300 ms são descartados.
 */
export function keepIntervals(
  durationMs: number,
  trim: { startMs: number; endMs: number | null },
  silences: { startMs: number; endMs: number }[],
  pad = 150,
): [number, number][] {
  const a0 = trim.startMs;
  const b0 = Math.min(trim.endMs ?? durationMs, durationMs);
  const cuts = silences
    .map((s) => [s.startMs + pad, s.endMs - pad] as [number, number])
    .filter(([a, b]) => b - a >= 200)
    .sort((x, y) => x[0] - y[0]);
  const keep: [number, number][] = [];
  let cur = a0;
  for (const [a, b] of cuts) {
    if (b <= cur || a >= b0) continue;
    if (a > cur) keep.push([cur, Math.min(a, b0)]);
    cur = Math.max(cur, b);
    if (cur >= b0) break;
  }
  if (cur < b0) keep.push([cur, b0]);
  return keep.filter(([a, b]) => b - a >= 300);
}

export const keptDuration = (keep: [number, number][]) => keep.reduce((n, [a, b]) => n + (b - a), 0);

/** Leva as legendas (tempos do vídeo original) para a linha do tempo do vídeo cortado. */
export function remapCaptions(segs: CaptionSegment[], keep: [number, number][]): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  for (const s of segs) {
    let offset = 0;
    let start: number | null = null;
    let end: number | null = null;
    for (const [a, b] of keep) {
      const lo = Math.max(a, s.startMs);
      const hi = Math.min(b, s.endMs);
      if (hi > lo) {
        if (start == null) start = offset + (lo - a);
        end = offset + (hi - a);
      }
      offset += b - a;
    }
    if (start != null && end != null && end - start >= 200)
      out.push({ startMs: start, endMs: end, text: s.text });
  }
  return out;
}

// ─── Legendas embutidas (ASS / libass) ─────────────────

const assTime = (ms: number) => {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const assText = (t: string) => t.replace(/\\/g, "＼").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

export function buildAss(
  segs: CaptionSegment[],
  opts: { width: number; height: number; font: string; position: CaptionPosition },
): string {
  const size = Math.round(Math.min(opts.width, opts.height) * 0.062);
  const marginV = opts.position === "meio" ? Math.round(opts.height * 0.45) : Math.round(opts.height * 0.12);
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${opts.width}`,
    `PlayResY: ${opts.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Legenda,${opts.font},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(3, Math.round(size / 12))},1,2,${Math.round(opts.width * 0.08)},${Math.round(opts.width * 0.08)},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...segs.map(
      (s) => `Dialogue: 0,${assTime(s.startMs)},${assTime(s.endMs)},Legenda,,0,0,0,,${assText(s.text)}`,
    ),
    "",
  ].join("\n");
}

// ─── Comando do FFmpeg ─────────────────

/** Texto para o filtro drawtext (escapa o que o FFmpeg interpreta). */
export const drawtextEscape = (t: string) =>
  t
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,");
/** Caminho de arquivo dentro de um filtro (ass=…, fontfile=…). */
const filterPath = (p: string) =>
  p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");

export interface FfmpegPlan {
  input: string;
  output: string;
  format: VideoFormat;
  fit: VideoFit;
  keep: [number, number][];
  hasAudio: boolean;
  assFile: string | null;
  fontsDir: string;
  logo: { file: string; position: VideoLogoPosition } | null;
  endCard: {
    title: string;
    cta: string;
    seconds: number;
    background: string;
    accent: string;
    fontFile: string;
  } | null;
}

/** Monta os argumentos do FFmpeg para um formato (H.264 + AAC, 30 fps, pronto para Meta). */
export function buildFfmpegArgs(p: FfmpegPlan): string[] {
  const { width: W, height: H } = VIDEO_FORMATS[p.format];
  const sel = p.keep
    .map(([a, b]) => `between(t\\,${(a / 1000).toFixed(3)}\\,${(b / 1000).toFixed(3)})`)
    .join("+");
  const f: string[] = [];
  f.push(`[0:v]fps=30,select='${sel}',setpts=N/FRAME_RATE/TB,setsar=1[v0]`);
  if (p.fit === "desfocado") {
    f.push(`[v0]split[va][vb]`);
    f.push(`[va]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:6[bg]`);
    f.push(`[vb]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`);
    f.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v1]`);
  } else {
    f.push(`[v0]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[v1]`);
  }
  let v = "v1";
  if (p.assFile) {
    f.push(`[${v}]ass='${filterPath(p.assFile)}':fontsdir='${filterPath(p.fontsDir)}'[v2]`);
    v = "v2";
  }
  let inputs = 1;
  const args = ["-hide_banner", "-y", "-i", p.input];
  if (p.logo) {
    args.push("-i", p.logo.file);
    const lw = Math.round(Math.min(W, H) * 0.22);
    const m = Math.round(Math.min(W, H) * 0.05);
    const pos =
      p.logo.position === "topo-esquerda"
        ? `${m}:${m}`
        : p.logo.position === "topo-direita"
          ? `W-w-${m}:${m}`
          : `W-w-${m}:H-h-${Math.round(H * 0.05)}`;
    f.push(`[${inputs}:v]scale=${lw}:-1,format=rgba[lg]`);
    f.push(`[${v}][lg]overlay=${pos}[v3]`);
    v = "v3";
    inputs++;
  }
  f.push(`[${v}]format=yuv420p[vmain]`);
  if (p.hasAudio) {
    f.push(`[0:a]aselect='${sel}',asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo[amain]`);
  } else {
    const dur = (p.keep.reduce((n, [a, b]) => n + (b - a), 0) / 1000).toFixed(3);
    f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${dur}[amain]`);
  }
  let vOut = "vmain";
  let aOut = "amain";
  if (p.endCard) {
    const e = p.endCard;
    const font = filterPath(e.fontFile);
    const big = Math.round(Math.min(W, H) * 0.075);
    const small = Math.round(Math.min(W, H) * 0.05);
    const bg = e.background.replace("#", "0x");
    let card = `color=c=${bg}:s=${W}x${H}:d=${e.seconds}:r=30,drawtext=fontfile='${font}':text='${drawtextEscape(e.title)}':fontcolor=white:fontsize=${big}:x=(w-text_w)/2:y=(h-text_h)/2-${e.cta ? big : 0}`;
    if (e.cta)
      card += `,drawtext=fontfile='${font}':text='${drawtextEscape(e.cta)}':fontcolor=white:fontsize=${small}:box=1:boxcolor=${e.accent.replace("#", "0x")}:boxborderw=${Math.round(small * 0.6)}:x=(w-text_w)/2:y=(h/2)+${Math.round(big * 0.6)}`;
    f.push(`${card},format=yuv420p,setsar=1[vend]`);
    f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${e.seconds}[aend]`);
    f.push(`[vmain][amain][vend][aend]concat=n=2:v=1:a=1[vout][aout]`);
    vOut = "vout";
    aOut = "aout";
  }
  args.push(
    "-filter_complex",
    f.join(";"),
    "-map",
    `[${vOut}]`,
    "-map",
    `[${aOut}]`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    p.output,
  );
  return args;
}
