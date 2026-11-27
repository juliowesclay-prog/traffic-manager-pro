"use client";

/**
 * Envio de um arquivo do Marketing em 3 passos (reserva → bytes → conferência), com progresso.
 * O mesmo fluxo servirá para o Cloudflare R2 (o endereço do passo 2 passa a ser o do R2).
 */
export type UploadOutcome = { ok: true; id: string } | { ok: false; message: string };

async function json(res: Response): Promise<{ ok?: boolean; message?: string; id?: string; uploadUrl?: string }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function put(url: string, file: File, onProgress: (pct: number) => void): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => resolve({ status: 0, body: "" });
    xhr.send(file);
  });
}

export async function uploadMarketingFile(
  file: File,
  purpose: "criativo" | "logo",
  onProgress: (pct: number, stage: "enviando" | "conferindo") => void,
): Promise<UploadOutcome> {
  const start = await fetch("/api/v1/admin/marketing/envios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size, purpose }),
  });
  const s = await json(start);
  if (!start.ok || !s.ok || !s.id || !s.uploadUrl) return { ok: false, message: s.message ?? "Não foi possível começar o envio." };

  const sent = await put(s.uploadUrl, file, (pct) => onProgress(pct, "enviando"));
  if (sent.status !== 200) {
    let message = "O envio foi interrompido. Confira a internet e tente de novo.";
    try {
      message = (JSON.parse(sent.body) as { message?: string }).message ?? message;
    } catch {
      /* resposta sem JSON */
    }
    return { ok: false, message };
  }

  onProgress(100, "conferindo");
  const done = await fetch(`/api/v1/admin/marketing/envios/${s.id}/concluir`, { method: "POST" });
  const d = await json(done);
  if (!done.ok || !d.ok) return { ok: false, message: d.message ?? "O arquivo não passou na conferência." };
  return { ok: true, id: s.id };
}
