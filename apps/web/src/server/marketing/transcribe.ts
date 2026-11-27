import "server-only";
import type { CaptionSegment } from "@tmp/core";

/**
 * Transcrição da fala (legendas automáticas). TRANSCRIBE_PROVIDER: "openai" (OPENAI_API_KEY, modelo
 * whisper-1, que devolve os tempos de cada trecho) ou "simulado" (trechos DEMO, só fora de produção).
 * O áudio chega do servidor de vídeo já reduzido (MP3 mono), e não é guardado depois.
 */

export class TranscribeError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

export function transcribeProviderName(): "openai" | "simulado" | null {
  const v = process.env.TRANSCRIBE_PROVIDER;
  if (v === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (v === "simulado" && process.env.APP_ENV !== "production") return "simulado";
  return null;
}

export async function transcribe(
  audio: Uint8Array,
  durationMs: number,
): Promise<{ segments: CaptionSegment[]; model: string }> {
  const name = transcribeProviderName();
  if (!name) throw new TranscribeError("A transcrição automática ainda não foi configurada.");
  if (name === "simulado") {
    const segments: CaptionSegment[] = [];
    for (let t = 0, i = 1; t < durationMs; t += 3000, i++)
      segments.push({ startMs: t, endMs: Math.min(durationMs, t + 2800), text: `DEMO legenda ${i}` });
    return { segments, model: "simulado-trechos-v1" };
  }
  const form = new FormData();
  form.append("file", new Blob([audio as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("language", "pt");
  form.append("response_format", "verbose_json");
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(240_000),
    });
  } catch (e) {
    throw new TranscribeError("Não foi possível falar com o serviço de transcrição.", String(e));
  }
  const body = (await res.json().catch(() => ({}))) as {
    segments?: { start: number; end: number; text: string }[];
    error?: { message?: string };
  };
  if (!res.ok)
    throw new TranscribeError(
      "O serviço de transcrição recusou o áudio.",
      `${res.status} ${body.error?.message}`,
    );
  const segments = (body.segments ?? [])
    .map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim().slice(0, 120),
    }))
    .filter((s) => s.text && s.endMs > s.startMs);
  return { segments, model: "whisper-1" };
}
