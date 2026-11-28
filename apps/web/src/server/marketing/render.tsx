import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import sharp from "sharp";
import {
  ART_FORMATS,
  fitFontSize,
  fontSlug,
  readableOn,
  type ArtFormat,
  type ArtSpec,
  type CarouselSpec,
} from "@tmp/core";
import { readAssetBytes } from "./media";

/**
 * Desenho das artes e das páginas de carrossel no próprio servidor (funciona na Vercel, sem serviço
 * pago): a receita (spec) vira um PNG de verdade, em 1080 px, com as fontes e cores da marca.
 * Fotos e logomarca vêm do armazenamento privado da empresa aberta.
 */

const FONT_DIR = (() => {
  const candidates = [
    path.join(process.cwd(), "assets/fonts"),
    path.join(process.cwd(), "../../assets/fonts"),
    path.join(process.cwd(), "apps/web/../../assets/fonts"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
})();

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
const fontCache = new Map<string, Promise<Font[]>>();
function loadFont(name: string): Promise<Font[]> {
  let p = fontCache.get(name);
  if (!p) {
    p = Promise.all(
      ([400, 700] as const).map(async (weight) => {
        const buf = await readFile(path.join(FONT_DIR, `${fontSlug(name)}-latin-${weight}-normal.woff`));
        return {
          name,
          weight,
          style: "normal" as const,
          data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        };
      }),
    );
    fontCache.set(name, p);
    p.catch(() => fontCache.delete(name));
  }
  return p;
}

async function fonts(...names: string[]) {
  return (await Promise.all([...new Set(names)].map(loadFont))).flat();
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
type Img = { src: string; width: number; height: number };

/** Foto de fundo recortada no tamanho exato (JPEG), para a arte ficar leve. */
async function photo(assetId: string | null, width: number, height: number): Promise<Img | null> {
  if (!assetId) return null;
  const file = await readAssetBytes(assetId, MAX_SOURCE_BYTES);
  if (!file || !file.mime.startsWith("image/")) return null;
  const out = await sharp(file.bytes, { limitInputPixels: 12000 * 12000 })
    .rotate()
    .resize(width, height, { fit: "cover", position: "attention" })
    .jpeg({ quality: 86 })
    .toBuffer();
  return { src: `data:image/jpeg;base64,${out.toString("base64")}`, width, height };
}

/** Logomarca reduzida (PNG com transparência), cabendo na caixa. */
async function logo(assetId: string | null, boxW: number, boxH: number): Promise<Img | null> {
  if (!assetId) return null;
  const file = await readAssetBytes(assetId, MAX_SOURCE_BYTES);
  if (!file || !file.mime.startsWith("image/")) return null;
  const { data, info } = await sharp(file.bytes)
    .resize(boxW, boxH, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
}

export interface RenderBrand {
  logoAssetId: string | null;
}

async function toPng(node: ReactNode, format: ArtFormat, fontList: Font[]): Promise<Uint8Array> {
  const { width, height } = ART_FORMATS[format];
  const res = new ImageResponse(node as React.ReactElement, { width, height, fonts: fontList });
  return new Uint8Array(await res.arrayBuffer());
}

const pill = (text: string, bg: string, fontFamily: string, size: number): ReactNode => (
  <div
    style={{
      display: "flex",
      alignSelf: "flex-start",
      background: bg,
      color: readableOn(bg),
      fontFamily,
      fontWeight: 700,
      fontSize: size,
      padding: `${Math.round(size * 0.55)}px ${Math.round(size * 1.1)}px`,
      borderRadius: 999,
    }}
  >
    {text}
  </div>
);

/** Desenha uma arte (Etapa 2). */
export async function renderArt(spec: ArtSpec, brand: RenderBrand | null): Promise<Uint8Array> {
  const { width, height } = ART_FORMATS[spec.format];
  const pad = Math.round(width * 0.075);
  const tall = spec.format === "stories";
  const { primary, accent } = spec.colors;
  const onPrimary = readableOn(primary);
  const [bg, mark, fontList] = await Promise.all([
    spec.template === "texto"
      ? null
      : photo(spec.backgroundAssetId, width, spec.template === "faixa" ? Math.round(height * 0.5) : height),
    spec.showLogo
      ? logo(brand?.logoAssetId ?? null, Math.round(width * 0.3), Math.round(width * 0.12))
      : null,
    fonts(spec.headingFont, spec.bodyFont),
  ]);

  // Na "faixa" o texto divide a altura com a foto: letras um pouco menores.
  const k = spec.template === "faixa" && !tall ? 0.78 : 1;
  const titleSize = Math.round(fitFontSize(spec.title, tall ? 104 : 88, 48, tall ? 34 : 30) * k);
  const subSize = Math.round((tall ? 44 : 38) * k);
  const ctaSize = tall ? 40 : 34;

  const logoNode = mark ? (
    <img src={mark.src} width={mark.width} height={mark.height} style={{ objectFit: "contain" }} />
  ) : null;
  const logoTop =
    logoNode && spec.logoPosition !== "rodape" ? (
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: pad,
          ...(spec.logoPosition === "topo-direita" ? { right: pad } : { left: pad }),
        }}
      >
        {logoNode}
      </div>
    ) : null;

  const texts = (color: string): ReactNode => (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(pad * 0.4) }}>
      {spec.highlight ? (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            background: accent,
            color: readableOn(accent),
            fontFamily: spec.headingFont,
            fontWeight: 700,
            fontSize: Math.round(titleSize * 0.8),
            padding: `${Math.round(pad * 0.2)}px ${Math.round(pad * 0.4)}px`,
            borderRadius: 16,
          }}
        >
          {spec.highlight}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          fontFamily: spec.headingFont,
          fontWeight: 700,
          fontSize: titleSize,
          lineHeight: 1.08,
          color,
        }}
      >
        {spec.title}
      </div>
      {spec.subtitle ? (
        <div
          style={{
            display: "flex",
            fontFamily: spec.bodyFont,
            fontSize: subSize,
            lineHeight: 1.3,
            color,
            opacity: 0.92,
          }}
        >
          {spec.subtitle}
        </div>
      ) : null}
      {spec.cta || (logoNode && spec.logoPosition === "rodape") ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: Math.round(pad * 0.3),
          }}
        >
          {spec.cta ? pill(spec.cta, accent, spec.bodyFont, ctaSize) : <div style={{ display: "flex" }} />}
          {spec.logoPosition === "rodape" ? logoNode : null}
        </div>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (spec.template === "faixa") {
    const band = Math.round(height * 0.5);
    body = (
      <div style={{ display: "flex", flexDirection: "column", width, height, background: primary }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            height: height - band,
            padding: pad,
            paddingTop: logoTop ? pad * 2 : pad,
            paddingBottom: Math.round(pad * 0.7),
          }}
        >
          {texts(onPrimary)}
        </div>
        <div style={{ display: "flex", height: band, background: accent }}>
          {bg ? <img src={bg.src} width={width} height={band} style={{ objectFit: "cover" }} /> : null}
        </div>
        {logoTop}
      </div>
    );
  } else if (spec.template === "texto" || !bg) {
    body = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: spec.template === "oferta" ? "center" : "flex-end",
          width,
          height,
          padding: pad,
          paddingTop: pad * 2.2,
          backgroundImage: `linear-gradient(160deg, ${primary} 0%, ${primary} 55%, ${accent} 160%)`,
        }}
      >
        {texts(onPrimary)}
        {logoTop}
      </div>
    );
  } else {
    // destaque / oferta com foto: foto inteira e degradê escuro para o texto ficar legível.
    body = (
      <div style={{ display: "flex", width, height, position: "relative" }}>
        <img
          src={bg.src}
          width={width}
          height={height}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: Math.round(height * 0.7),
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            position: "absolute",
            left: pad,
            right: pad,
            bottom: pad,
          }}
        >
          {texts("#FFFFFF")}
        </div>
        {logoTop}
      </div>
    );
  }
  return toPng(body, spec.format, fontList);
}

/** Desenha todas as páginas de um carrossel (Etapa 3): capa, conteúdo numerado e chamada final. */
export async function renderCarousel(
  spec: CarouselSpec,
  brand: RenderBrand | null,
  only?: number,
): Promise<Uint8Array[]> {
  const { width, height } = ART_FORMATS[spec.format];
  const pad = Math.round(width * 0.08);
  const { primary, accent } = spec.colors;
  const onPrimary = readableOn(primary);
  const [cover, mark, fontList] = await Promise.all([
    only === undefined || only === 0 ? photo(spec.coverAssetId, width, height) : null,
    spec.showLogo
      ? logo(brand?.logoAssetId ?? null, Math.round(width * 0.26), Math.round(width * 0.1))
      : null,
    fonts(spec.headingFont, spec.bodyFont),
  ]);
  const total = spec.pages.length;
  const out: Uint8Array[] = [];
  for (const [i, page] of spec.pages.entries()) {
    if (only !== undefined && i !== only) continue;
    const first = i === 0;
    const last = i === total - 1 && total > 1;
    const dark = first ? !!cover : false;
    const bgColor = first || last ? primary : "#FFFFFF";
    const fg = dark ? "#FFFFFF" : first || last ? onPrimary : "#111827";
    const titleSize = fitFontSize(page.title, first ? 92 : 72, 44, first ? 28 : 34);
    const node = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: first ? "flex-end" : "center",
          width,
          height,
          padding: pad,
          position: "relative",
          background: bgColor,
          ...(first && !cover
            ? { backgroundImage: `linear-gradient(160deg, ${primary} 0%, ${primary} 60%, ${accent} 170%)` }
            : {}),
        }}
      >
        {first && cover ? (
          <>
            <img
              src={cover.src}
              width={width}
              height={height}
              style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
            />
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: Math.round(height * 0.75),
                backgroundImage:
                  "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.85) 100%)",
              }}
            />
          </>
        ) : null}
        {!first && !last ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: 18,
              height,
              background: accent,
            }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: Math.round(pad * 0.35) }}>
          {!first && !last ? (
            <div
              style={{
                display: "flex",
                fontFamily: spec.headingFont,
                fontWeight: 700,
                fontSize: 40,
                color: accent,
              }}
            >
              {String(i).padStart(2, "0")}
            </div>
          ) : null}
          {page.title ? (
            <div
              style={{
                display: "flex",
                fontFamily: spec.headingFont,
                fontWeight: 700,
                fontSize: titleSize,
                lineHeight: 1.1,
                color: fg,
              }}
            >
              {page.title}
            </div>
          ) : null}
          {page.text ? (
            <div
              style={{
                display: "flex",
                fontFamily: spec.bodyFont,
                fontSize: first ? 40 : 42,
                lineHeight: 1.35,
                color: fg,
                opacity: 0.92,
              }}
            >
              {page.text}
            </div>
          ) : null}
          {last && spec.cta ? (
            <div style={{ display: "flex", marginTop: 16 }}>{pill(spec.cta, accent, spec.bodyFont, 38)}</div>
          ) : null}
          {first ? (
            <div
              style={{
                display: "flex",
                marginTop: 12,
                fontFamily: spec.bodyFont,
                fontSize: 30,
                color: fg,
                opacity: 0.85,
              }}
            >
              Arraste para o lado →
            </div>
          ) : null}
        </div>
        {mark ? (
          <img
            src={mark.src}
            width={mark.width}
            height={mark.height}
            style={{ position: "absolute", top: pad * 0.7, left: pad, objectFit: "contain" }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: Math.round(pad * 0.5),
            right: pad,
            fontFamily: spec.bodyFont,
            fontSize: 26,
            color: fg,
            opacity: 0.7,
          }}
        >
          {`${i + 1}/${total}`}
        </div>
      </div>
    );
    out.push(await toPng(node, spec.format, fontList));
  }
  return out;
}
