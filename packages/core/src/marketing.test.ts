import { describe, expect, it } from "vitest";
import {
  aspectLabel,
  bufferReader,
  checkDeclaredUpload,
  checkProbedMedia,
  creativeKindFor,
  creativeStatusChange,
  manualStatusOptions,
  normalizeHexColor,
  parseBrand,
  probeMedia,
  safeFileName,
} from "./index";

// ─── Arquivos sintéticos (só os bytes que a conferência lê) ─────────────────

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

function png(w: number, h: number) {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...str("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
}

function jpeg(w: number, h: number) {
  // SOI, APP0 (16 bytes), SOF0 com altura e largura.
  const app0 = [0xff, 0xe0, 0, 16, ...str("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xff, 0xc0, 0, 17, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}

const box = (type: string, body: number[]) => [...be32(8 + body.length), ...str(type), ...body];

function mp4({ brand = "isom", seconds = 30, w = 1920, h = 1080, rotate = false, moovLast = false } = {}) {
  const timescale = 1000;
  const mvhd = box("mvhd", [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(seconds * timescale), ...new Array(80).fill(0)]);
  const matrix = rotate
    ? [...be32(0), ...be32(65536), ...be32(0), ...be32(-65536 >>> 0), ...be32(0), ...be32(0), ...be32(0), ...be32(0), ...be32(0x40000000)]
    : [...be32(65536), ...be32(0), ...be32(0), ...be32(0), ...be32(65536), ...be32(0), ...be32(0), ...be32(0), ...be32(0x40000000)];
  const tkhd = box("tkhd", [
    0, 0, 0, 3,
    ...be32(0), ...be32(0), ...be32(1), ...be32(0), ...be32(seconds * timescale),
    ...new Array(16).fill(0),
    ...matrix,
    ...be32(w * 65536), ...be32(h * 65536),
  ]);
  const moov = box("moov", [...mvhd, ...box("trak", tkhd)]);
  const ftyp = box("ftyp", [...str(brand), 0, 0, 0, 0, ...str("isom")]);
  const mdat = box("mdat", new Array(64).fill(7));
  return new Uint8Array(moovLast ? [...ftyp, ...mdat, ...moov] : [...ftyp, ...moov, ...mdat]);
}

const probe = (b: Uint8Array) => probeMedia(bufferReader(b), b.length);

describe("probeMedia (conferência pelo conteúdo)", () => {
  it("lê PNG e JPEG", async () => {
    expect(await probe(png(1080, 1350))).toMatchObject({ ok: true, kind: "IMAGEM", mime: "image/png", width: 1080, height: 1350 });
    expect(await probe(jpeg(1080, 1920))).toMatchObject({ ok: true, mime: "image/jpeg", ext: "jpg", width: 1080, height: 1920 });
  });

  it("lê MP4 e MOV com duração e medidas, inclusive com os metadados no fim", async () => {
    expect(await probe(mp4())).toMatchObject({ ok: true, kind: "VIDEO", mime: "video/mp4", durationMs: 30000, width: 1920, height: 1080 });
    expect(await probe(mp4({ brand: "qt  ", moovLast: true, seconds: 12 }))).toMatchObject({
      ok: true,
      mime: "video/quicktime",
      ext: "mov",
      durationMs: 12000,
    });
  });

  it("vídeo de celular em pé (girado 90°) fica vertical", async () => {
    expect(await probe(mp4({ w: 1920, h: 1080, rotate: true }))).toMatchObject({ width: 1080, height: 1920 });
  });

  it("recusa arquivo disfarçado, HEIC, SVG e vazio", async () => {
    expect(await probe(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toMatchObject({ ok: false });
    expect(await probe(new TextEncoder().encode("MZ executável disfarçado de .jpg............"))).toMatchObject({ ok: false });
    expect(await probe(mp4({ brand: "heic" }))).toMatchObject({ ok: false, reason: expect.stringContaining("HEIC") });
    expect(await probe(new Uint8Array(4))).toMatchObject({ ok: false });
  });

  it("recusa vídeo sem metadados", async () => {
    const ftypOnly = new Uint8Array(box("ftyp", [...str("isom"), 0, 0, 0, 0]).concat(box("mdat", new Array(32).fill(0))));
    expect(await probe(ftypOnly)).toMatchObject({ ok: false });
  });
});

describe("limites de arquivo", () => {
  it("confere o declarado antes do envio", () => {
    expect(checkDeclaredUpload("criativo", "image/png", 1000)).toEqual({ ok: true, kind: "IMAGEM" });
    expect(checkDeclaredUpload("criativo", "video/quicktime", 100 * 1024 * 1024)).toEqual({ ok: true, kind: "VIDEO" });
    expect(checkDeclaredUpload("criativo", "image/svg+xml", 1000).ok).toBe(false);
    expect(checkDeclaredUpload("logo", "video/mp4", 1000).ok).toBe(false);
    expect(checkDeclaredUpload("criativo", "image/jpeg", 21 * 1024 * 1024).ok).toBe(false);
    expect(checkDeclaredUpload("criativo", "video/mp4", 501 * 1024 * 1024).ok).toBe(false);
    expect(checkDeclaredUpload("criativo", "image/png", 0).ok).toBe(false);
  });

  it("confere as medidas reais", () => {
    expect(checkProbedMedia("criativo", { kind: "IMAGEM", width: 1080, height: 1080 }, 1000).ok).toBe(true);
    expect(checkProbedMedia("criativo", { kind: "IMAGEM", width: 100, height: 1080 }, 1000).ok).toBe(false);
    expect(checkProbedMedia("logo", { kind: "IMAGEM", width: 100, height: 100 }, 1000).ok).toBe(true);
    expect(checkProbedMedia("criativo", { kind: "VIDEO", width: 1080, height: 1920, durationMs: 11 * 60_000 }, 1000).ok).toBe(false);
  });

  it("define o tipo do criativo pelos arquivos", () => {
    expect(creativeKindFor(["IMAGEM"])).toEqual({ ok: true, kind: "IMAGEM" });
    expect(creativeKindFor(["IMAGEM", "IMAGEM", "IMAGEM"])).toEqual({ ok: true, kind: "CARROSSEL" });
    expect(creativeKindFor(["VIDEO"])).toEqual({ ok: true, kind: "VIDEO" });
    expect(creativeKindFor(["VIDEO", "IMAGEM"]).ok).toBe(false);
    expect(creativeKindFor(new Array(11).fill("IMAGEM")).ok).toBe(false);
    expect(creativeKindFor([]).ok).toBe(false);
  });

  it("nomeia proporções da Meta", () => {
    expect(aspectLabel(1080, 1080)).toContain("1:1");
    expect(aspectLabel(1080, 1350)).toContain("4:5");
    expect(aspectLabel(1080, 1920)).toContain("9:16");
    expect(aspectLabel(1000, 333)).toBe("1000×333");
  });

  it("gera nome de download seguro", () => {
    expect(safeFileName('Cartão "Trabalhador"\r\n/../x', "png")).toBe("Cartao-Trabalhador.x.png");
    expect(safeFileName("", "mp4")).toBe("arquivo.mp4");
  });
});

describe("status do criativo", () => {
  it("só quem aprova marca como aprovado", () => {
    expect(creativeStatusChange(["MARKETING"], "AGUARDANDO_APROVACAO", "APROVADO").ok).toBe(false);
    expect(creativeStatusChange(["GESTOR"], "AGUARDANDO_APROVACAO", "APROVADO").ok).toBe(true);
    expect(creativeStatusChange(["LEITURA"], "RASCUNHO", "EM_EDICAO").ok).toBe(false);
  });

  it("'Enviado para Meta' nunca é manual e, depois dele, só arquivar", () => {
    expect(creativeStatusChange(["SUPERADMIN"], "APROVADO", "ENVIADO_META").ok).toBe(false);
    expect(creativeStatusChange(["SUPERADMIN"], "ENVIADO_META", "RASCUNHO").ok).toBe(false);
    expect(creativeStatusChange(["SUPERADMIN"], "ENVIADO_META", "ARQUIVADO").ok).toBe(true);
    expect(manualStatusOptions(["MARKETING"], "RASCUNHO")).toEqual(["EM_EDICAO", "AGUARDANDO_APROVACAO", "ARQUIVADO"]);
  });
});

describe("kit da marca", () => {
  it("normaliza cores", () => {
    expect(normalizeHexColor("#0a5")).toBe("#00AA55");
    expect(normalizeHexColor("1f4fd8")).toBe("#1F4FD8");
    expect(normalizeHexColor("azul")).toBeNull();
  });

  it("valida e normaliza a marca", () => {
    const r = parseBrand({
      name: "  Prosed+Saúde ",
      website: "prosedsaude.com.br",
      colors: ["#1f4fd8", "#1F4FD8", ""],
      ctas: ["Assine agora", " Assine agora ", "Fale conosco"],
      socials: { instagram: "instagram.com/prosed" },
      headingFont: "Sora",
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        name: "Prosed+Saúde",
        website: "https://prosedsaude.com.br/",
        colors: ["#1F4FD8"],
        ctas: ["Assine agora", "Fale conosco"],
        socials: { instagram: "https://instagram.com/prosed" },
        headingFont: "Sora",
        bodyFont: null,
      },
    });
  });

  it("recusa dados inválidos", () => {
    const base = { name: "Marca", colors: [], ctas: [], socials: {} };
    expect(parseBrand({ ...base, name: "X" }).ok).toBe(false);
    expect(parseBrand({ ...base, website: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseBrand({ ...base, colors: ["vermelho"] }).ok).toBe(false);
    expect(parseBrand({ ...base, headingFont: "Comic Sans" }).ok).toBe(false);
    expect(parseBrand({ ...base, socials: { facebook: "não é endereço" } }).ok).toBe(false);
  });
});
