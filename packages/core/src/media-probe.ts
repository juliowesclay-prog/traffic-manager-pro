/**
 * Conferência dos arquivos enviados ao módulo Marketing, pelo CONTEÚDO (bytes), nunca pelo nome ou pelo
 * tipo informado pelo navegador. Aceita só PNG, JPEG, WEBP, MP4 e MOV; lê largura, altura e duração.
 * Arquivo que não for reconhecido é recusado (proteção contra upload malicioso disfarçado).
 */

export type ProbedMedia =
  | { ok: true; kind: "IMAGEM"; mime: "image/png" | "image/jpeg" | "image/webp"; ext: string; width: number; height: number }
  | {
      ok: true;
      kind: "VIDEO";
      mime: "video/mp4" | "video/quicktime";
      ext: string;
      width: number;
      height: number;
      durationMs: number;
    }
  | { ok: false; reason: string };

/** Lê um pedaço do arquivo (offset, tamanho). Retorna menos bytes se o arquivo acabar antes. */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const le16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const le24 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
const s32 = (b: Uint8Array, o: number) => u32(b, o) | 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);

const NOT_SUPPORTED =
  "Formato não aceito. Envie imagens PNG, JPG ou WEBP, ou vídeos MP4 ou MOV. (Fotos HEIC do iPhone: exporte como JPG.)";

function pngSize(b: Uint8Array) {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32(b, 16), height: u32(b, 20) };
}

function jpegSize(b: Uint8Array) {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      o += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = u16(b, o + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: u16(b, o + 5), width: u16(b, o + 7) };
    if (len < 2) return null;
    o += 2 + len;
  }
  return null;
}

function webpSize(b: Uint8Array) {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 " && b.length >= 30) return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
  if (chunk === "VP8L" && b.length >= 25) {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && b.length >= 30) return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
  return null;
}

interface Box {
  type: string;
  start: number; // início do conteúdo
  end: number;
}

/** Lista as caixas (boxes) MP4 entre start e end. */
async function boxes(read: ByteReader, start: number, end: number, max = 4096): Promise<Box[]> {
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end && out.length < max) {
    const h = await read(o, 16);
    if (h.length < 8) break;
    let size = u32(h, 0);
    const type = ascii(h, 4, 4);
    let header = 8;
    if (size === 1) {
      if (h.length < 16) break;
      size = u64(h, 8);
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header || o + size > end) break;
    out.push({ type, start: o + header, end: o + size });
    o += size;
  }
  return out;
}

async function mp4Info(read: ByteReader, fileSize: number) {
  const top = await boxes(read, 0, fileSize);
  const moov = top.find((b) => b.type === "moov");
  if (!moov) return null;
  // moov costuma ser pequeno (metadados); limite de 32 MB por segurança.
  if (moov.end - moov.start > 32 * 1024 * 1024) return null;
  const inner = await boxes(read, moov.start, moov.end);
  const mvhd = inner.find((b) => b.type === "mvhd");
  if (!mvhd) return null;
  const mh = await read(mvhd.start, 32);
  const v = mh[0];
  const timescale = v === 1 ? u32(mh, 20) : u32(mh, 12);
  const duration = v === 1 ? u64(mh, 24) : u32(mh, 16);
  if (!timescale) return null;
  const durationMs = Math.round((duration / timescale) * 1000);

  for (const trak of inner.filter((b) => b.type === "trak")) {
    const tkhd = (await boxes(read, trak.start, trak.end)).find((b) => b.type === "tkhd");
    if (!tkhd) continue;
    const t = await read(tkhd.start, 96);
    const base = t[0] === 1 ? 4 + 32 + 16 : 4 + 20 + 16; // depois de versão/flags, tempos e reservados
    const matrix = base; // 9 valores de 4 bytes
    const width = u32(t, matrix + 36) / 65536;
    const height = u32(t, matrix + 40) / 65536;
    if (width > 0 && height > 0) {
      const a = s32(t, matrix);
      const bb = s32(t, matrix + 4);
      // Celular gravando em pé: a imagem é gravada deitada e girada 90° (matriz a=0, b=±1).
      const rotated = a === 0 && Math.abs(bb) === 65536;
      return {
        durationMs,
        width: Math.round(rotated ? height : width),
        height: Math.round(rotated ? width : height),
      };
    }
  }
  return { durationMs, width: 0, height: 0 };
}

/** Identifica o arquivo pelo conteúdo e lê suas medidas. */
export async function probeMedia(read: ByteReader, fileSize: number): Promise<ProbedMedia> {
  if (fileSize < 16) return { ok: false, reason: "Arquivo vazio ou corrompido." };
  const head = await read(0, 64 * 1024);

  if (u32(head, 0) === 0x89504e47 && u32(head, 4) === 0x0d0a1a0a) {
    const s = pngSize(head);
    return s ? { ok: true, kind: "IMAGEM", mime: "image/png", ext: "png", ...s } : { ok: false, reason: "PNG corrompido." };
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    const s = jpegSize(head);
    return s
      ? { ok: true, kind: "IMAGEM", mime: "image/jpeg", ext: "jpg", ...s }
      : { ok: false, reason: "Não foi possível ler as medidas do JPG." };
  }
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") {
    const s = webpSize(head);
    return s ? { ok: true, kind: "IMAGEM", mime: "image/webp", ext: "webp", ...s } : { ok: false, reason: "WEBP corrompido." };
  }
  if (ascii(head, 4, 4) === "ftyp") {
    const brand = ascii(head, 8, 4);
    if (/^(heic|heix|mif1|msf1|avif)$/.test(brand)) return { ok: false, reason: NOT_SUPPORTED };
    const info = await mp4Info(read, fileSize);
    if (!info || info.durationMs <= 0) return { ok: false, reason: "Vídeo sem duração legível ou corrompido." };
    if (!info.width || !info.height) return { ok: false, reason: "O arquivo não tem imagem de vídeo (só áudio?)." };
    const mov = brand === "qt  ";
    return {
      ok: true,
      kind: "VIDEO",
      mime: mov ? "video/quicktime" : "video/mp4",
      ext: mov ? "mov" : "mp4",
      ...info,
    };
  }
  return { ok: false, reason: NOT_SUPPORTED };
}

/** Leitor para testes e arquivos já em memória. */
export const bufferReader =
  (buf: Uint8Array): ByteReader =>
  async (offset, length) =>
    buf.subarray(offset, Math.min(buf.length, offset + length));
