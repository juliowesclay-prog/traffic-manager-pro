import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AwsClient } from "aws4fetch";
import type { ByteReader } from "@tmp/core";
import { storageConfig, type S3Config } from "./storage-config";

/**
 * Armazenamento PRIVADO dos arquivos do Marketing. Nada fica em pasta pública: todo download passa
 * pela rota do servidor, que confere login e empresa.
 *
 * - "local": disco do servidor (desenvolvimento ou VPS), pasta STORAGE_LOCAL_DIR (padrão ".storage").
 * - "r2": Cloudflare R2 (compatível com S3). O navegador envia e baixa DIRETO do R2 por links
 *   temporários assinados (a Vercel aceita no máximo 4,5 MB por requisição). O bucket fica privado.
 */
export interface StorageDriver {
  readonly name: string;
  /** Grava o conteúdo recebido, recusando se passar de maxBytes. Retorna o tamanho gravado. */
  write(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number>;
  size(key: string): Promise<number | null>;
  reader(key: string): ByteReader;
  /** Conteúdo (inteiro ou um trecho, para vídeos). */
  stream(key: string, range?: { start: number; end: number }): ReadableStream<Uint8Array>;
  copy(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Só no R2: link temporário para o navegador enviar os bytes direto (PUT). */
  presignPut?(key: string, expiresSeconds: number): Promise<string>;
  /** Só no R2: link temporário para baixar/exibir, com nome e tipo do arquivo. */
  presignGet?(
    key: string,
    opts: { expiresSeconds: number; filename: string; contentType: string; download: boolean },
  ): Promise<string>;
}

export class TooLargeError extends Error {}

/** Chave interna: <empresa>/<id>.<ext>. Só letras, números e hífen (nunca vem do usuário). */
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{2,5})?$/;
export const storageKeyFor = (companyId: string, assetId: string, ext?: string) =>
  `${companyId}/${assetId}${ext ? `.${ext}` : ""}`;

function localDriver(root: string): StorageDriver {
  const file = (key: string) => {
    if (!KEY.test(key)) throw new Error("Chave de armazenamento inválida.");
    const p = path.resolve(root, key);
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error("Chave fora do armazenamento.");
    return p;
  };
  return {
    name: "local",
    async write(key, body, maxBytes) {
      const dest = file(key);
      await mkdir(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.parcial`;
      let total = 0;
      const limit = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctl) {
          total += chunk.byteLength;
          if (total > maxBytes) ctl.error(new TooLargeError("Arquivo maior que o permitido."));
          else ctl.enqueue(chunk);
        },
      });
      try {
        await pipeline(
          Readable.fromWeb(body.pipeThrough(limit) as import("node:stream/web").ReadableStream),
          createWriteStream(tmp, { mode: 0o600 }),
        );
        await rename(tmp, dest);
        return total;
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
    },
    async size(key) {
      try {
        return (await stat(file(key))).size;
      } catch {
        return null;
      }
    },
    reader(key) {
      return async (offset, length) => {
        const fh = await open(file(key), "r");
        try {
          const buf = new Uint8Array(length);
          const { bytesRead } = await fh.read(buf, 0, length, offset);
          return buf.subarray(0, bytesRead);
        } finally {
          await fh.close();
        }
      };
    },
    stream(key, range) {
      const s = createReadStream(file(key), range ? { start: range.start, end: range.end } : {});
      return Readable.toWeb(s) as ReadableStream<Uint8Array>;
    },
    async copy(from, to) {
      const dest = file(to);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(file(from), dest);
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
  };
}

/** Cloudflare R2 (ou outro S3 compatível, como MinIO nos testes), sempre privado. */
function s3Driver(cfg: S3Config): StorageDriver {
  const aws = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: cfg.region,
  });
  const url = (key: string) => {
    if (!KEY.test(key)) throw new Error("Chave de armazenamento inválida.");
    return `${cfg.endpoint}/${encodeURIComponent(cfg.bucket)}/${key}`;
  };
  const check = async (res: Response, what: string) => {
    if (!res.ok && res.status !== 206) {
      const text = await res.text().catch(() => "");
      throw new Error(`Armazenamento: ${what} falhou (${res.status}) ${text.slice(0, 200)}`);
    }
    return res;
  };
  const presign = async (u: string, method: "GET" | "PUT", expiresSeconds: number) => {
    const target = new URL(u);
    target.searchParams.set("X-Amz-Expires", String(expiresSeconds));
    const signed = await aws.sign(new Request(target, { method }), { aws: { signQuery: true } });
    return signed.url;
  };
  return {
    name: "r2",
    async write(key, body, maxBytes) {
      // Usado só para arquivos gerados no servidor (artes, páginas de carrossel): cabem na memória.
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new TooLargeError("Arquivo maior que o permitido.");
        chunks.push(value);
      }
      const buf = Buffer.concat(chunks);
      await check(await aws.fetch(url(key), { method: "PUT", body: buf }), "gravar");
      return total;
    },
    async size(key) {
      const res = await aws.fetch(url(key), { method: "HEAD" });
      if (res.status === 404) return null;
      await check(res, "consultar");
      const n = Number(res.headers.get("content-length"));
      return Number.isFinite(n) ? n : null;
    },
    reader(key) {
      return async (offset, length) => {
        if (length <= 0) return new Uint8Array(0);
        const res = await aws.fetch(url(key), {
          headers: { Range: `bytes=${offset}-${offset + length - 1}` },
        });
        if (res.status === 416) return new Uint8Array(0);
        await check(res, "ler");
        return new Uint8Array(await res.arrayBuffer()).subarray(0, length);
      };
    },
    stream(key, range) {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      void (async () => {
        try {
          const res = await aws.fetch(
            url(key),
            range ? { headers: { Range: `bytes=${range.start}-${range.end}` } } : {},
          );
          await check(res, "ler");
          if (!res.body) throw new Error("Armazenamento: resposta vazia.");
          await res.body.pipeTo(writable);
        } catch (e) {
          await writable.abort(e).catch(() => undefined);
        }
      })();
      return readable;
    },
    async copy(from, to) {
      await check(
        await aws.fetch(url(to), {
          method: "PUT",
          headers: { "x-amz-copy-source": `/${encodeURIComponent(cfg.bucket)}/${from}` },
        }),
        "copiar",
      );
    },
    async remove(key) {
      const res = await aws.fetch(url(key), { method: "DELETE" });
      if (res.status !== 404) await check(res, "apagar");
    },
    presignPut(key, expiresSeconds) {
      return presign(url(key), "PUT", expiresSeconds);
    },
    presignGet(key, opts) {
      const u = new URL(url(key));
      u.searchParams.set(
        "response-content-disposition",
        `${opts.download ? "attachment" : "inline"}; filename="${opts.filename}"`,
      );
      u.searchParams.set("response-content-type", opts.contentType);
      u.searchParams.set("response-cache-control", "private, max-age=600");
      return presign(u.toString(), "GET", opts.expiresSeconds);
    },
  };
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "O armazenamento de arquivos ainda não está configurado neste ambiente. Peça ao administrador para ligar o armazenamento (Cloudflare R2).",
    );
  }
}

let cached: StorageDriver | null = null;

/** Motorista em uso. Na Vercel o disco é temporário: só o R2 é aceito lá. */
export function storage(): StorageDriver {
  if (cached) return cached;
  const cfg = storageConfig();
  if (!cfg) throw new StorageNotConfiguredError();
  cached = cfg.driver === "r2" ? s3Driver(cfg) : localDriver(cfg.dir);
  return cached;
}

/** O armazenamento está disponível? (para avisar na tela em vez de falhar no envio) */
export function storageReady(): boolean {
  try {
    storage();
    return true;
  } catch {
    return false;
  }
}
