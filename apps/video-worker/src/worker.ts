/**
 * Servidor de vídeo do Traffic Manager Pro (Etapa 4). Roda FORA da Vercel (VPS, Railway, Fly.io ou
 * o próprio computador), onde há FFmpeg. Não acessa o banco: pede tarefas ao site, baixa o vídeo por
 * link temporário, edita com FFmpeg e devolve o resultado. Só precisa de:
 *   APP_URL               endereço do site (ex.: https://painel.suaempresa.com.br)
 *   VIDEO_WORKER_SECRET   o mesmo segredo configurado no site (32+ caracteres)
 *   VIDEO_WORKER_NAME     opcional, nome deste servidor nos registros
 *   FONTS_DIR             opcional, pasta das fontes (padrão: assets/fonts do repositório)
 * Uso: pnpm --filter @tmp/video-worker start   (ou: pnpm video-worker)
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  buildAss,
  buildFfmpegArgs,
  fontSlug,
  keepIntervals,
  keptDuration,
  parseSilences,
  remapCaptions,
  VIDEO_FORMATS,
  type VideoEditSpec,
  type VideoFormat,
} from "@tmp/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const fileEnv = existsSync(path.join(root, ".env"))
  ? parseEnv(readFileSync(path.join(root, ".env"), "utf8"))
  : {};
const env = (k: string) => process.env[k] ?? fileEnv[k];

const APP = (env("APP_URL") ?? "http://localhost:3300").replace(/\/+$/, "");
const SECRET = env("VIDEO_WORKER_SECRET") ?? "";
const NAME = (env("VIDEO_WORKER_NAME") ?? hostname()).replace(/[^\w.-]/g, "").slice(0, 60) || "servidor";
const FONTS = env("FONTS_DIR") ?? path.join(root, "assets/fonts");
const IDLE_MS = Number(env("VIDEO_WORKER_IDLE_MS") ?? 5000);
const ONCE = process.argv.includes("--uma-vez");

if (SECRET.length < 32) {
  console.error("VIDEO_WORKER_SECRET ausente ou curto (mínimo 32 caracteres).");
  process.exit(1);
}

interface Job {
  id: string;
  kind: "TRANSCREVER" | "EDITAR";
  durationMs: number;
  source: string;
  logo: string | null;
  spec: VideoEditSpec | null;
  outputs: { format: VideoFormat; assetId: string; url: string }[];
}

const log = (...a: unknown[]) => console.warn(new Date().toISOString(), ...a);
const ours = (url: string) => url.startsWith(APP);
const auth = (url: string): Record<string, string> =>
  ours(url) ? { "x-video-secret": SECRET, "x-video-worker": NAME } : {};

async function api(pathname: string, init: RequestInit = {}) {
  const url = `${APP}/api/internal/video${pathname}`;
  return fetch(url, { ...init, headers: { ...auth(url), ...(init.headers as Record<string, string>) } });
}

async function download(url: string, dest: string) {
  const res = await fetch(url, { headers: auth(url) });
  if (!res.ok || !res.body) throw new Error(`download falhou (${res.status})`);
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(dest),
  );
}

async function upload(url: string, file: string) {
  const size = (await stat(file)).size;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...auth(url), "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: Readable.toWeb(createReadStream(file)) as ReadableStream,
    duplex: "half",
  } as RequestInit);
  if (!res.ok) throw new Error(`envio do resultado falhou (${res.status})`);
}

function run(
  cmd: string,
  args: string[],
  onStdout?: (line: string) => void,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let buf = "";
    p.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) onStdout?.(l);
    });
    p.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-200_000);
    });
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/** O vídeo tem faixa de áudio? (sem áudio, o FFmpeg recebe um silêncio no lugar) */
async function audioStreams(file: string) {
  return new Promise<boolean>((resolve) => {
    const p = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.on("close", () => resolve(out.trim().length > 0));
    p.on("error", () => resolve(false));
  });
}

let lastReport = 0;
async function progress(id: string, pct: number, force = false) {
  if (!force && Date.now() - lastReport < 3000) return;
  lastReport = Date.now();
  const r = await api(`/tarefas/${id}/progresso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progresso: pct }),
  }).catch(() => null);
  if (r && r.status === 409) throw new Error("a tarefa não é mais deste servidor");
}

async function transcribe(job: Job, dir: string) {
  const src = path.join(dir, "origem");
  await download(job.source, src);
  await progress(job.id, 30, true);
  const audio = path.join(dir, "audio.mp3");
  // Áudio mono 16 kHz, 32 kbps: ~2,4 MB por 10 minutos (cabe no limite do site).
  const r = await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-i",
    src,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "32k",
    audio,
  ]);
  if (r.code !== 0) throw new Error(`não foi possível extrair o áudio: ${r.stderr.slice(-300)}`);
  await progress(job.id, 60, true);
  const bytes = await readFile(audio);
  const res = await api(`/tarefas/${job.id}/audio`, {
    method: "POST",
    headers: { "Content-Type": "audio/mpeg", "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; trechos?: number };
  if (!res.ok || !body.ok) throw new Error(body.message ?? `o site recusou o áudio (${res.status})`);
  log(`tarefa ${job.id}: transcrição com ${body.trechos} trechos`);
}

async function edit(job: Job, dir: string) {
  const spec = job.spec!;
  const src = path.join(dir, "origem");
  await download(job.source, src);
  let logoFile: string | null = null;
  if (job.logo) {
    logoFile = path.join(dir, "logo");
    await download(job.logo, logoFile);
  }
  const audio = await audioStreams(src);
  let silences: { startMs: number; endMs: number }[] = [];
  if (spec.removeSilence && audio) {
    const r = await run("ffmpeg", [
      "-hide_banner",
      "-i",
      src,
      "-vn",
      "-af",
      "silencedetect=noise=-32dB:d=0.6",
      "-f",
      "null",
      "-",
    ]);
    silences = parseSilences(r.stderr);
  }
  const keep = keepIntervals(job.durationMs, spec.trim, silences);
  if (!keep.length || keptDuration(keep) < 1000)
    throw new Error("depois dos cortes sobrou menos de 1 segundo de vídeo");
  const total = keptDuration(keep) + (spec.endCard.enabled ? spec.endCard.seconds * 1000 : 0);
  await progress(job.id, 5, true);

  const segs = spec.captions.enabled ? remapCaptions(spec.captions.segments, keep) : [];
  for (const [i, out] of job.outputs.entries()) {
    const { width, height } = VIDEO_FORMATS[out.format];
    let assFile: string | null = null;
    if (segs.length) {
      assFile = path.join(dir, `legenda-${i}.ass`);
      await writeFile(
        assFile,
        buildAss(segs, { width, height, font: spec.captions.font, position: spec.captions.position }),
      );
    }
    const output = path.join(dir, `saida-${i}.mp4`);
    const args = buildFfmpegArgs({
      input: src,
      output,
      format: out.format,
      fit: spec.fit,
      keep,
      hasAudio: audio,
      assFile,
      fontsDir: FONTS,
      logo: logoFile && spec.logo.enabled ? { file: logoFile, position: spec.logo.position } : null,
      endCard: spec.endCard.enabled
        ? {
            ...spec.endCard,
            fontFile: path.join(FONTS, `${fontSlug(spec.endCard.font)}-latin-700-normal.woff`),
          }
        : null,
    });
    const share = 95 / job.outputs.length;
    let pending: Promise<void> | null = null;
    const r = await run("ffmpeg", args, (line) => {
      const m = /^out_time_us=(\d+)/.exec(line);
      if (m && !pending) {
        const pct = 5 + share * i + share * Math.min(1, Number(m[1]) / 1000 / total);
        pending = progress(job.id, pct)
          .catch(() => undefined)
          .finally(() => (pending = null));
      }
    });
    if (r.code !== 0) throw new Error(`FFmpeg falhou no formato ${out.format}: ${r.stderr.slice(-400)}`);
    await upload(out.url, output);
    await progress(job.id, 5 + share * (i + 1), true);
  }
  const res = await api(`/tarefas/${job.id}/concluir`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    criativos?: string[];
    erros?: string[];
  };
  if (!res.ok) throw new Error(`o site recusou a conclusão (${res.status})`);
  log(
    `tarefa ${job.id}: ${body.criativos?.length ?? 0} vídeo(s) criados${body.erros?.length ? `, erros: ${body.erros.join("; ")}` : ""}`,
  );
}

async function tick(): Promise<boolean> {
  const res = await api("/proxima", { method: "POST" });
  if (res.status === 204) return false;
  if (!res.ok) throw new Error(`o site respondeu ${res.status} ao pedir tarefa`);
  const job = (await res.json()) as Job;
  log(`tarefa ${job.id} (${job.kind}) iniciada`);
  const dir = await mkdtemp(path.join(tmpdir(), "tmp-video-"));
  try {
    if (job.kind === "TRANSCREVER") await transcribe(job, dir);
    else await edit(job, dir);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    log(`tarefa ${job.id} falhou: ${msg}`);
    await api(`/tarefas/${job.id}/falhou`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ erro: msg.slice(0, 300) }),
    }).catch(() => undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return true;
}

log(`servidor de vídeo "${NAME}" ligado em ${APP}`);
for (;;) {
  let worked = false;
  try {
    worked = await tick();
  } catch (e) {
    log("erro ao falar com o site:", (e as Error).message);
  }
  if (ONCE && !worked) break;
  if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS));
}
