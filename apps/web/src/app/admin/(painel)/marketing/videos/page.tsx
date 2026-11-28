import type { Metadata } from "next";
import Link from "next/link";
import { can, formatDuration, type VideoEditSpec } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { LinkButton } from "@/components/link-button";
import { fileUrl, MediaPreview } from "@/components/marketing/media-preview";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { storageReady } from "@/server/marketing/storage";
import { transcribeProviderName } from "@/server/marketing/transcribe";
import { jobsFor, latestTranscript, workerLastSeen } from "@/server/marketing/video";
import { AutoRefresh, CancelJob, VideoEditor } from "./editor";

export const metadata: Metadata = { title: "Editor de Vídeos IA" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const STATUS: Record<string, string> = {
  NA_FILA: "Na fila",
  PROCESSANDO: "Processando",
  CONCLUIDO: "Pronto",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};

/** Editor de Vídeos IA (Etapa 4): escolhe um vídeo da biblioteca, pede a edição e acompanha a fila. */
export default async function VideosPage({ searchParams }: { searchParams: Promise<{ criativo?: string }> }) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canManage = can(roles, "marketing:manage");
  const seen = await workerLastSeen();
  const online = !!seen && Date.now() - seen.getTime() < 2 * 60 * 1000;
  const workerNote = (
    <p
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${online ? "bg-saving-50 text-saving-dark" : "bg-amber-50 text-amber-900"}`}
      data-testid="servidor-video"
    >
      {online
        ? "Servidor de vídeo ligado."
        : seen
          ? `Servidor de vídeo sem contato desde ${when(seen)}. Os pedidos ficam na fila até ele voltar.`
          : "Servidor de vídeo ainda não foi ligado. Os pedidos ficam na fila até ele ser instalado."}
    </p>
  );

  if (!sp.criativo || !UUID.test(sp.criativo)) {
    const videos = await prisma.creative.findMany({
      where: { kind: "VIDEO", status: { not: "ARQUIVADO" } },
      orderBy: { updatedAt: "desc" },
      take: 60,
      include: { versions: { orderBy: { number: "desc" }, take: 1, include: { assets: { take: 1 } } } },
    });
    return (
      <>
        <AdminPageTitle
          title="Editor de Vídeos IA"
          subtitle="Cortes, formatos, legendas, logomarca e encerramento, em MP4 pronto para a Meta."
        />
        <div className="grid gap-6">
          {workerNote}
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Escolha o vídeo</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Envie o vídeo bruto pela biblioteca (MP4 ou MOV, até 10 minutos). O original nunca é alterado:
              cada edição vira um criativo novo.
            </p>
            {videos.length ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="lista-videos">
                {videos.map((v) => {
                  const a = v.versions[0]?.assets[0];
                  return (
                    <li key={v.id} className="rounded-lg border border-line p-3">
                      <Link
                        href={`/admin/marketing/videos?criativo=${v.id}`}
                        className="font-semibold text-accent-text underline"
                      >
                        {v.name}
                      </Link>
                      <p className="text-sm text-ink-soft">
                        {a?.width}×{a?.height}
                        {a?.durationMs ? ` · ${formatDuration(a.durationMs)}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4">Nenhum vídeo na biblioteca ainda.</p>
            )}
            <LinkButton href="/admin/marketing/biblioteca" variant="secondary" className="mt-4 w-fit">
              Enviar vídeo pela biblioteca
            </LinkButton>
          </Card>
        </div>
      </>
    );
  }

  const c = await prisma.creative.findFirst({
    where: { id: sp.criativo, kind: "VIDEO" },
    include: {
      brand: {
        select: {
          name: true,
          logoAssetId: true,
          colors: true,
          bodyFont: true,
          headingFont: true,
          ctas: true,
        },
      },
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { assets: { where: { status: "PRONTO" }, take: 1 } },
      },
    },
  });
  const asset = c?.versions[0]?.assets[0];
  if (!c || !asset?.durationMs)
    return (
      <>
        <AdminPageTitle title="Editor de Vídeos IA" />
        <Card>
          <p>Vídeo não encontrado.</p>
        </Card>
      </>
    );
  const [jobs, transcript] = await Promise.all([jobsFor(c.id), latestTranscript(c.id)]);
  const created = jobs.flatMap((j) => (j.result as { criativos?: string[] } | null)?.criativos ?? []);
  const names = created.length
    ? Object.fromEntries(
        (
          await prisma.creative.findMany({ where: { id: { in: created } }, select: { id: true, name: true } })
        ).map((x) => [x.id, x.name]),
      )
    : {};
  const active = jobs.some((j) => j.status === "NA_FILA" || j.status === "PROCESSANDO");

  return (
    <>
      <AutoRefresh active={active} />
      <p className="mb-3 text-sm">
        <Link href="/admin/marketing/videos" className="font-semibold text-accent-text underline">
          ← Escolher outro vídeo
        </Link>
      </p>
      <AdminPageTitle
        title={`Editar: ${c.name}`}
        subtitle={`${asset.width}×${asset.height} · ${formatDuration(asset.durationMs)}${c.brand ? ` · ${c.brand.name}` : ""}`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-6">
          {workerNote}
          {canManage && storageReady() ? (
            <Card>
              <VideoEditor
                creativeId={c.id}
                name={c.name}
                durationMs={asset.durationMs}
                brand={
                  c.brand
                    ? {
                        hasLogo: !!c.brand.logoAssetId,
                        colors: c.brand.colors,
                        font: c.brand.headingFont ?? c.brand.bodyFont,
                        cta: c.brand.ctas[0] ?? null,
                      }
                    : null
                }
                transcript={transcript}
                transcribeOn={transcribeProviderName() !== null}
              />
            </Card>
          ) : (
            <Card>
              <p>
                {canManage
                  ? "O armazenamento de arquivos ainda não foi ligado neste ambiente."
                  : "Seu perfil pode ver, mas não editar vídeos."}
              </p>
            </Card>
          )}
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Original</h2>
            <MediaPreview
              asset={{ id: asset.id, kind: asset.kind, width: asset.width, height: asset.height }}
              controls
              alt={`Vídeo ${c.name}`}
              className="mt-3 max-h-[60vh] w-full rounded-lg"
            />
            <a
              href={fileUrl(asset.id, true)}
              className="mt-2 inline-block text-sm font-semibold text-accent-text underline"
              download
            >
              Baixar o original
            </a>
          </Card>
          <Card data-testid="fila-video">
            <h2 className="font-display text-base font-semibold text-ink">Pedidos</h2>
            {jobs.length ? (
              <ul className="mt-3 grid gap-3">
                {jobs.map((j) => {
                  const spec = j.kind === "EDITAR" ? (j.spec as unknown as VideoEditSpec) : null;
                  const out = (j.result as { criativos?: string[]; segmentos?: unknown[] } | null) ?? {};
                  return (
                    <li key={j.id} className="border-b border-line pb-3">
                      <p className="font-semibold">
                        {j.kind === "TRANSCREVER" ? "Transcrição" : `Edição: ${spec?.formats.join(", ")}`} ·{" "}
                        {STATUS[j.status]}
                        {j.status === "PROCESSANDO" ? ` (${j.progress}%)` : ""}
                      </p>
                      <p className="text-sm text-ink-soft">{when(j.createdAt)}</p>
                      {j.error ? <p className="text-sm text-red-dark">{j.error}</p> : null}
                      {j.kind === "TRANSCREVER" && j.status === "CONCLUIDO" ? (
                        <p className="text-sm">
                          {out.segmentos?.length ?? 0} trechos: as legendas foram preenchidas no editor.
                        </p>
                      ) : null}
                      {out.criativos?.length ? (
                        <ul className="mt-1 grid gap-1 text-sm">
                          {out.criativos.map((id) => (
                            <li key={id}>
                              <Link
                                href={`/admin/marketing/biblioteca/${id}`}
                                className="font-semibold text-accent-text underline"
                              >
                                {names[id] ?? "Abrir vídeo gerado"}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {canManage && j.status === "NA_FILA" ? <CancelJob id={j.id} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">Nenhum pedido ainda.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
