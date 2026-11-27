import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ByteReader } from "@tmp/core";

/**
 * Armazenamento PRIVADO dos arquivos do Marketing. Nada fica em pasta pública: todo download passa
 * pela rota do servidor, que confere login e empresa.
 *
 * Etapa 1: disco local (STORAGE_DRIVER=local, pasta STORAGE_LOCAL_DIR, padrão ".storage").
 * Próximas etapas: Cloudflare R2 (compatível com S3), com envio direto do navegador por link temporário
 * (a Vercel aceita no máximo 4,5 MB por requisição). As telas não mudam: só este "motorista".
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

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "O armazenamento de arquivos ainda não está configurado neste ambiente. Peça ao administrador para ligar o armazenamento (Cloudflare R2).",
    );
  }
}

let cached: StorageDriver | null = null;

/** Motorista em uso. Na Vercel o disco é temporário: sem R2 configurado, o envio é recusado. */
export function storage(): StorageDriver {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") throw new StorageNotConfiguredError(); // R2 entra junto com a Etapa 2
  if (process.env.VERCEL) throw new StorageNotConfiguredError();
  cached = localDriver(path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || ".storage"));
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
