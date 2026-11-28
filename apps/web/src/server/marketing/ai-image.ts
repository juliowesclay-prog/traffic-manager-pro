import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ArtFormat } from "@tmp/core";

/**
 * Gerador de FOTOS de fundo por IA (Etapa 2). A arte em si (texto, logomarca, cores) é desenhada pelo
 * nosso servidor; a IA só cria a imagem, sem texto.
 * IMAGE_PROVIDER: "openai" (OPENAI_API_KEY; modelo IMAGE_MODEL, padrão gpt-image-1; imagens com uso
 * comercial permitido pelos termos da OpenAI) ou "simulado" (degradê DEMO, só fora de produção).
 */

export class ImageGenError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}

export function imageProviderName(): "openai" | "simulado" | null {
  const v = process.env.IMAGE_PROVIDER;
  if (v === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (v === "simulado" && process.env.APP_ENV !== "production") return "simulado";
  return null;
}

export const imageModel = () => process.env.IMAGE_MODEL || "gpt-image-1";

const SIZE: Record<ArtFormat, "1024x1024" | "1024x1536"> = {
  quadrado: "1024x1024",
  retrato: "1024x1536",
  stories: "1024x1536",
};

// Regras sempre somadas ao pedido (políticas da Meta e direitos de imagem).
const GUARD =
  "Fotografia realista para anúncio de rede social. Sem nenhum texto, letra, número, marca d'água ou logotipo na imagem. Sem pessoas famosas ou marcas de terceiros. Sem antes e depois, sem nudez, sem procedimentos médicos explícitos. Composição com espaço livre na parte de baixo para texto.";

export async function generateBackground(
  prompt: string,
  format: ArtFormat,
): Promise<{ png: Uint8Array; model: string }> {
  const name = imageProviderName();
  if (!name) throw new ImageGenError("A geração de imagens por IA ainda não foi configurada.");
  const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 900);
  if (clean.length < 5)
    throw new ImageGenError("Descreva a imagem que você quer (pelo menos algumas palavras).");

  if (name === "simulado") {
    const h = createHash("sha256").update(clean).digest();
    const c1 = `#${h.subarray(0, 3).toString("hex")}`;
    const c2 = `#${h.subarray(3, 6).toString("hex")}`;
    const [w, hgt] = SIZE[format].split("x").map(Number) as [number, number];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${hgt * 0.3}" r="${w * 0.22}" fill="#ffffff" fill-opacity="0.18"/><text x="40" y="80" font-family="sans-serif" font-size="44" fill="#ffffff" fill-opacity="0.8">IMAGEM DEMO</text></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { png: new Uint8Array(png), model: "simulado-degrade-v1" };
  }

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: imageModel(),
        prompt: `${GUARD}\n\nCena: ${clean}`,
        size: SIZE[format],
        quality: "medium",
        n: 1,
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (e) {
    throw new ImageGenError("Não foi possível falar com o gerador de imagens. Tente de novo.", String(e));
  }
  const body = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string }[];
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new ImageGenError(
        "A chave do gerador de imagens foi recusada. Confira a configuração.",
        body.error?.message,
      );
    if (res.status === 429)
      throw new ImageGenError(
        "Muitos pedidos de imagem agora. Tente em alguns minutos.",
        body.error?.message,
      );
    if (res.status === 400)
      throw new ImageGenError(
        "O gerador recusou esta descrição (política de conteúdo). Reformule.",
        body.error?.message,
      );
    throw new ImageGenError(
      "O gerador de imagens não respondeu. Tente de novo.",
      `${res.status} ${body.error?.message}`,
    );
  }
  const b64 = body.data?.[0]?.b64_json;
  if (!b64)
    throw new ImageGenError("O gerador de imagens respondeu sem imagem. Tente de novo.", "sem b64_json");
  // Regrava como PNG limpo (remove metadados).
  const png = await sharp(Buffer.from(b64, "base64")).png().toBuffer();
  return { png: new Uint8Array(png), model: imageModel() };
}
