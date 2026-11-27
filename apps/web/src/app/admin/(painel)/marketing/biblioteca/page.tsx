import type { Metadata } from "next";
import Link from "next/link";
import {
  can,
  CREATIVE_KIND_LABELS,
  CREATIVE_KINDS,
  CREATIVE_STATUS_LABELS,
  CREATIVE_STATUSES,
} from "@tmp/core";
import { Button, Card, cn, Field, SelectField } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { MediaPreview } from "@/components/marketing/media-preview";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { listCreatives } from "@/server/marketing/creatives";
import { storageReady } from "@/server/marketing/storage";
import { ImportCreativeForm } from "./forms";
import { STATUS_TONE } from "./status-tone";

export const metadata: Metadata = { title: "Biblioteca de Criativos" };


const when = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; status?: string }>;
}) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canManage = can(roles, "marketing:manage");
  const [items, brands, campaigns] = await Promise.all([
    listCreatives({ q: sp.q, kind: sp.tipo, status: sp.status }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.metaCampaign.findMany({
      where: { missingSince: null },
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true },
    }),
  ]);
  const ready = storageReady();

  return (
    <>
      <AdminPageTitle
        title="Biblioteca de Criativos"
        subtitle="Imagens, carrosséis e vídeos da empresa, com versões, status e aprovação"
      />

      {canManage ? (
        <Card className="mb-6">
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-display text-base font-semibold text-ink">
              Importar criativo
            </summary>
            <div className="mt-3">
              {ready ? (
                <ImportCreativeForm brands={brands} campaigns={campaigns} />
              ) : (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                  O armazenamento de arquivos ainda não está ligado neste ambiente (na Vercel ele depende do
                  Cloudflare R2). A biblioteca pode ser consultada, mas envios ficam bloqueados.
                </p>
              )}
            </div>
          </details>
        </Card>
      ) : null}

      <form className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] sm:items-end" role="search">
        <Field label="Pesquisar por nome" name="q" defaultValue={sp.q ?? ""} type="search" />
        <SelectField label="Tipo" name="tipo" defaultValue={sp.tipo ?? ""}>
          <option value="">Todos</option>
          {CREATIVE_KINDS.map((k) => (
            <option key={k} value={k}>
              {CREATIVE_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" name="status" defaultValue={sp.status ?? ""}>
          <option value="">Todos (menos arquivados)</option>
          {CREATIVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CREATIVE_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {items.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="biblioteca">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/marketing/biblioteca/${c.id}`}
                className="block h-full overflow-hidden rounded-xl border border-line bg-surface shadow-card hover:border-accent"
                data-testid={`criativo-${c.id}`}
              >
                <MediaPreview asset={c.cover} alt={`Prévia de ${c.name}`} className="aspect-square w-full" />
                <div className="grid gap-1.5 p-4">
                  <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[c.status])}>
                    {CREATIVE_STATUS_LABELS[c.status]}
                  </span>
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="text-sm text-ink-soft">
                    {CREATIVE_KIND_LABELS[c.kind]}
                    {c.kind === "CARROSSEL" ? ` · ${c.pages} páginas` : ""} · versão {c.currentVersion}
                    {c.brand ? ` · ${c.brand.name}` : ""}
                  </p>
                  <p className="text-xs text-ink-faint">Criado em {when(c.createdAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-ink-soft">
            {sp.q || sp.tipo || sp.status ? "Nenhum criativo com esses filtros." : "A biblioteca está vazia. Importe o primeiro criativo acima."}
          </p>
        </Card>
      )}
    </>
  );
}
