import { describe, expect, it } from "vitest";
import { contrastRatio, fitFontSize, parseArtSpec, parseCarouselSpec, readableOn } from "./art";
import { checkAdPolicy, unapprovedPrices } from "./marketing-ai";
import { buildObjectStorySpec, parseMetaSubmission } from "./meta-publish";
import {
  buildAss,
  buildFfmpegArgs,
  keepIntervals,
  keptDuration,
  parseCaptionLines,
  parseSilences,
  parseVideoSpec,
  remapCaptions,
} from "./video";
import { buildZip, crc32 } from "./zip";

describe("artes e carrossel", () => {
  it("valida a receita da arte e cai nas cores padrão", () => {
    expect(parseArtSpec({ format: "x", template: "destaque", title: "Oi" }).ok).toBe(false);
    const r = parseArtSpec({
      format: "stories",
      template: "oferta",
      title: "  Título  ",
      highlight: "50%",
      colors: { primary: "zz" },
    });
    expect(r.ok && r.spec).toMatchObject({
      format: "stories",
      title: "Título",
      highlight: "50%",
      colors: { primary: "#1E3A8A" },
    });
  });
  it("carrossel: de 2 a 10 páginas", () => {
    expect(parseCarouselSpec({ format: "quadrado", pages: [{ title: "a", text: "" }] }).ok).toBe(false);
    expect(parseCarouselSpec({ format: "quadrado", pages: [{ title: "a" }, { title: "b" }] }).ok).toBe(true);
    expect(parseCarouselSpec({ format: "stories", pages: [{ title: "a" }, { title: "b" }] }).ok).toBe(false);
  });
  it("contraste e tamanho da fonte", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(readableOn("#FFFFFF")).not.toBe(readableOn("#000000"));
    expect(fitFontSize("curto", 100, 40, 20)).toBe(100);
    expect(fitFontSize("x".repeat(200), 100, 40, 20)).toBe(40);
  });
});

describe("textos e políticas", () => {
  it("aponta promessas que a Meta recusa", () => {
    expect(checkAdPolicy("Cura garantida em 7 dias").length).toBeGreaterThan(0);
    expect(checkAdPolicy("Atendimento no mesmo dia. Agende pelo site.")).toEqual([]);
  });
  it("preço que não está nas informações aprovadas", () => {
    const facts = [{ id: "1", tipo: "PRECO", titulo: "R$ 29,90 por mês", detalhe: null }];
    expect(unapprovedPrices(["Só R$ 29,90 por mês", "ou R$ 19,90"], facts)).toEqual(["R$ 19,90"]);
  });
});

describe("vídeo", () => {
  it("legendas: lê e recusa linhas mal formadas", () => {
    const r = parseCaptionLines("00:01.0 - 00:03.5 Olá, tudo bem?\n\n00:04 - 00:05 Segunda");
    expect(r.ok && r.segments).toEqual([
      { startMs: 1000, endMs: 3500, text: "Olá, tudo bem?" },
      { startMs: 4000, endMs: 5000, text: "Segunda" },
    ]);
    expect(parseCaptionLines("00:05 - 00:01 errado").ok).toBe(false);
  });
  it("silêncios viram cortes, e as legendas acompanham", () => {
    const sil = parseSilences(
      "[silencedetect] silence_start: 2.0\n[silencedetect] silence_end: 4.0 | silence_duration: 2",
    );
    expect(sil).toEqual([{ startMs: 2000, endMs: 4000 }]);
    const keep = keepIntervals(10_000, { startMs: 0, endMs: null }, sil);
    expect(keep).toEqual([
      [0, 2150],
      [3850, 10_000],
    ]);
    expect(keptDuration(keep)).toBe(8300);
    const caps = remapCaptions([{ startMs: 5000, endMs: 6000, text: "x" }], keep);
    expect(caps[0]).toMatchObject({ startMs: 5000 - 1700, endMs: 6000 - 1700 });
  });
  it("receita do editor e comando do FFmpeg (H.264, AAC, cortes, encerramento)", () => {
    const r = parseVideoSpec({ name: "Teste", formats: ["9:16", "nada"], trim: { startMs: 0 } }, 10_000, [
      "Inter",
    ]);
    expect(r.ok && r.spec.formats).toEqual(["9:16"]);
    expect(parseVideoSpec({ name: "Teste", formats: [] }, 10_000, ["Inter"]).ok).toBe(false);
    const ass = buildAss([{ startMs: 0, endMs: 1000, text: "Olá {x}" }], {
      width: 1080,
      height: 1920,
      font: "Inter",
      position: "baixo",
    });
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:01.00,Legenda,,0,0,0,,Olá x");
    const args = buildFfmpegArgs({
      input: "in.mp4",
      output: "out.mp4",
      format: "9:16",
      fit: "cortar",
      keep: [[0, 2000]],
      hasAudio: true,
      assFile: null,
      fontsDir: "/f",
      logo: null,
      endCard: {
        title: "Fim",
        cta: "Agende",
        seconds: 2,
        background: "#000000",
        accent: "#FFFFFF",
        fontFile: "/f/a.woff",
      },
    }).join(" ");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("+faststart");
    expect(args).toContain("concat");
  });
});

describe("zip", () => {
  it("crc32 conhecido e arquivo com assinatura", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    const z = buildZip([{ name: "página-1.png", data: new Uint8Array([1, 2, 3]) }]);
    expect([...z.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

describe("enviar para Meta", () => {
  const base = {
    adSetId: "120000000000001",
    pageId: "1090000000000001",
    adName: "Anúncio",
    primaryText: "Texto principal do anúncio",
    headline: "Título",
    link: "https://exemplo.com.br",
    callToAction: "SIGN_UP",
  };
  it("exige https, conjunto e página", () => {
    expect(parseMetaSubmission({ ...base, link: "http://x.com" }).ok).toBe(false);
    expect(parseMetaSubmission({ ...base, adSetId: "abc" }).ok).toBe(false);
    expect(parseMetaSubmission({ ...base, callToAction: "BUY_BITCOIN" }).ok).toBe(false);
    const r = parseMetaSubmission({ ...base, instagramId: "x" });
    expect(r.ok && r.value.instagramId).toBeNull();
  });
  it("monta o object_story_spec de imagem, carrossel e vídeo", () => {
    const r = parseMetaSubmission({ ...base, instagramId: "1780000000000001" });
    if (!r.ok) throw new Error(r.message);
    const img = buildObjectStorySpec(r.value, { kind: "IMAGEM", imageHash: "h1" }) as Record<string, unknown>;
    expect(img).toMatchObject({
      page_id: base.pageId,
      instagram_user_id: "1780000000000001",
      link_data: { image_hash: "h1" },
    });
    const car = buildObjectStorySpec(r.value, { kind: "CARROSSEL", imageHashes: ["a", "b"] }) as {
      link_data: { child_attachments: unknown[] };
    };
    expect(car.link_data.child_attachments).toHaveLength(2);
    const vid = buildObjectStorySpec(r.value, { kind: "VIDEO", videoId: "v", thumbnailUrl: "https://t" }) as {
      video_data: unknown;
    };
    expect(vid.video_data).toMatchObject({
      video_id: "v",
      image_url: "https://t",
      call_to_action: { type: "SIGN_UP" },
    });
  });
});
