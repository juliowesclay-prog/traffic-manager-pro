import { Clapperboard, Download, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  aspectLabel,
  can,
  CREATIVE_KIND_LABELS,
  CREATIVE_ORIGIN_LABELS,
  CREATIVE_STATUS_LABELS,
  formatBytes,
  formatDuration,
  manualStatusOptions,
} from "@tmp/core";
import { buttonClasses, Card, cn } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { LinkButton } from "@/components/link-button";
import { fileUrl, MediaPreview } from "@/components/marketing/media-preview";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { getCreative } from "@/server/marketing/creatives";
import { storageReady } from "@/server/marketing/storage";
import { DeleteForm, DetailsForm, DuplicateButton, NewVersionForm, StatusForm } from "../forms";
import { STATUS_TONE } from "../status-tone";
import { LinkAdForm, UnlinkAdButton } from "../../enviar-meta/forms";

export const metadata: Metadata = { title: "Criativo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function CreativePage({ params }: { params: Promise<{ id: string }> }) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const c = await getCreative(id);
  if (!c) notFound();
  const canManage = can(roles, "marketing:manage");
  const canApprove = can(roles, "marketing:approve");
  const ads = await prisma.metaAd.findMany({
    where: canManage ? { missingSince: null } : { externalId: { in: c.metaAdIds } },
    orderBy: { name: "asc" },
    take: 500,
    select: { externalId: true, name: true },
  });
  const adNames = new Map(ads.map((a) => [a.externalId, a.name]));
  const linkable = ads
    .filter((a) => !c.metaAdIds.includes(a.externalId))
    .map((a) => ({ id: a.externalId, name: a.name }));
  const [brands, campaigns] = canManage
    ? await Promise.all([
        prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.metaCampaign.findMany({
          where: { missingSince: null },
          orderBy: { name: "asc" },
          take: 300,
          select: { id: true, name: true },
        }),
      ])
    : [[], []];
  const current = c.versions[0]!;
  const locked = c.status === "ENVIADO_META" || c.status === "ARQUIVADO";
  const ready = storageReady();
  const tipo = (current.spec as { tipo?: string } | null)?.tipo;
  const recipe = tipo === "arte" || tipo === "carrossel" ? tipo : null;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/marketing/biblioteca" className="font-semibold text-accent-text underline">
          ← Biblioteca
        </Link>
      </p>
      <AdminPageTitle
        title={c.name}
        subtitle={
          <>
            {CREATIVE_KIND_LABELS[c.kind]} · {CREATIVE_ORIGIN_LABELS[c.origin]} · versão {c.currentVersion}
            {c.brand ? ` · ${c.brand.name}` : ""} · criado em {when(c.createdAt)} por{" "}
            {c.people[c.createdById] ?? "—"}
          </>
        }
        actions={
          <span
            className={cn("rounded-full px-3 py-1 text-sm font-semibold", STATUS_TONE[c.status])}
            data-testid="status-criativo"
          >
            {CREATIVE_STATUS_LABELS[c.status]}
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">
              Prévia da versão {current.number}
              {c.kind === "CARROSSEL" ? ` (${current.assets.length} páginas)` : ""}
            </h2>
            <ul
              className={cn("mt-3 grid gap-4", c.kind === "CARROSSEL" ? "sm:grid-cols-2" : "")}
              data-testid="previa"
            >
              {current.assets.map((a, i) => (
                <li key={a.id} className="grid gap-2">
                  <MediaPreview
                    asset={a}
                    controls
                    alt={c.kind === "CARROSSEL" ? `Página ${i + 1} de ${c.name}` : `Prévia de ${c.name}`}
                    className="max-h-[70vh] w-full rounded-lg"
                  />
                  <p className="text-xs text-ink-soft">
                    {c.kind === "CARROSSEL" ? `Página ${i + 1} · ` : ""}
                    {a.width}×{a.height} · {aspectLabel(a.width ?? 0, a.height ?? 0)}
                    {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ""}
                    {a.sizeBytes != null ? ` · ${formatBytes(Number(a.sizeBytes))}` : ""}
                  </p>
                  <a
                    href={fileUrl(a.id, true)}
                    className={buttonClasses("secondary", "md", "w-fit")}
                    download
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Baixar{c.kind === "CARROSSEL" ? ` página ${i + 1}` : ""}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              {c.kind === "CARROSSEL" ? (
                <a
                  href={`/api/v1/admin/marketing/criativos/${c.id}/zip?versao=${current.number}`}
                  className={buttonClasses("secondary", "md", "w-fit")}
                  download
                >
                  <Download aria-hidden="true" className="size-4" />
                  Baixar todas as páginas (ZIP)
                </a>
              ) : null}
              {canManage && !locked && recipe ? (
                <Link
                  href={`/admin/marketing/${recipe === "arte" ? "artes" : "carrossel"}?criativo=${c.id}`}
                  className={buttonClasses("primary", "md", "w-fit")}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  {recipe === "arte" ? "Editar a arte" : "Editar o carrossel"}
                </Link>
              ) : null}
              {canManage && !locked && c.kind === "VIDEO" ? (
                <Link
                  href={`/admin/marketing/videos?criativo=${c.id}`}
                  className={buttonClasses("primary", "md", "w-fit")}
                >
                  <Clapperboard aria-hidden="true" className="size-4" />
                  Editar no editor de vídeos
                </Link>
              ) : null}
            </div>
          </Card>

          <Card data-testid="versoes">
            <h2 className="font-display text-base font-semibold text-ink">Versões</h2>
            <p className="mt-1 text-sm text-ink-soft">
              O arquivo original (versão 1) e todas as versões ficam guardados.
            </p>
            <ol className="mt-3 grid gap-3">
              {c.versions.map((v) => (
                <li key={v.id} className="border-b border-line pb-3">
                  <p className="font-semibold">
                    Versão {v.number}
                    {v.number === c.approvedVersion ? (
                      <span className="ml-2 rounded-full bg-saving-50 px-2 py-0.5 text-xs text-saving-dark">
                        aprovada
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {when(v.createdAt)} · {c.people[v.createdById] ?? "—"}
                    {v.note ? ` · ${v.note}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {v.assets.map((a, i) => (
                      <a
                        key={a.id}
                        href={fileUrl(a.id, true)}
                        className="font-semibold text-accent-text underline"
                        download
                      >
                        Baixar {v.assets.length > 1 ? `página ${i + 1}` : "arquivo"}
                      </a>
                    ))}
                  </p>
                </li>
              ))}
            </ol>
            {canManage && !locked && ready ? (
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink">
                  Enviar nova versão
                </summary>
                <div className="mt-2">
                  <NewVersionForm id={c.id} multiple={c.kind === "CARROSSEL"} />
                </div>
              </details>
            ) : null}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Situação</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="text-ink-soft">Campanha relacionada</dt>
                <dd className="font-semibold">{c.campaign?.name ?? "Nenhuma"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Aprovação</dt>
                <dd className="font-semibold" data-testid="aprovacao">
                  {c.approvedAt
                    ? `Versão ${c.approvedVersion}, por ${c.people[c.approvedById ?? ""] ?? "—"} em ${when(c.approvedAt)}`
                    : "Ainda não aprovado"}
                </dd>
              </div>
            </dl>
            {canManage ? (
              <div className="mt-4">
                <StatusForm id={c.id} options={manualStatusOptions(roles, c.status)} />
              </div>
            ) : null}
            {c.status === "APROVADO" ? (
              <div className="mt-4 rounded-lg bg-navy-50 p-3 text-sm">
                <p>Pronto para a Meta. O anúncio é criado pausado; ativar é sempre decisão sua.</p>
                {canApprove ? (
                  <LinkButton href={`/admin/marketing/enviar-meta?criativo=${c.id}`} className="mt-2">
                    Enviar para a Meta
                  </LinkButton>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card data-testid="anuncios-vinculados">
            <h2 className="font-display text-base font-semibold text-ink">Anúncios na Meta</h2>
            {c.metaAdIds.length ? (
              <ul className="mt-3 grid gap-1 text-sm">
                {c.metaAdIds.map((ad) => (
                  <li key={ad} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {adNames.get(ad) ?? "Anúncio"} <span className="text-ink-soft">({ad})</span>
                    </span>
                    {canManage ? <UnlinkAdButton creativeId={c.id} adId={ad} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">Nenhum anúncio ligado a este criativo ainda.</p>
            )}
            {c.metaAdIds.length ? (
              <p className="mt-2 text-sm">
                <Link
                  href={`/admin/marketing/desempenho?criativo=${c.id}`}
                  className="font-semibold text-accent-text underline"
                >
                  Ver o desempenho
                </Link>
              </p>
            ) : null}
            {canManage ? (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-sm text-ink-soft">
                  Já publicou este criativo por fora? Vincule o anúncio para medir o resultado.
                </p>
                <LinkAdForm creativeId={c.id} ads={linkable} />
              </div>
            ) : null}
          </Card>

          {canManage ? (
            <Card>
              <h2 className="font-display text-base font-semibold text-ink">Editar dados</h2>
              <div className="mt-3">
                <DetailsForm
                  id={c.id}
                  name={c.name}
                  brands={brands}
                  campaigns={campaigns}
                  brandId={c.brandId}
                  campaignId={c.campaignId}
                />
              </div>
              <div className="mt-6 border-t border-line pt-4">
                <p className="mb-2 text-sm text-ink-soft">
                  Duplicar cria um rascunho novo com a versão atual.
                </p>
                <DuplicateButton id={c.id} />
              </div>
            </Card>
          ) : null}

          {canManage && c.status !== "ENVIADO_META" ? (
            <Card>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-red-dark">
                  Excluir criativo
                </summary>
                <div className="mt-3">
                  <DeleteForm id={c.id} name={c.name} />
                </div>
              </details>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
