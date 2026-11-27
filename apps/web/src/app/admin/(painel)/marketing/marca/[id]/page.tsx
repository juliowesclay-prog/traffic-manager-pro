import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND_FACT_KIND_LABELS, can } from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { MediaPreview } from "@/components/marketing/media-preview";
import { requireCompanyStaff } from "@/server/auth";
import { getBrand } from "@/server/marketing/brands";
import { storageReady } from "@/server/marketing/storage";
import { AddFactForm, BrandForm, DeleteBrandForm, FactButtons, LogoForm } from "../forms";

export const metadata: Metadata = { title: "Kit da marca" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const b = await getBrand(id);
  if (!b) notFound();
  const canManage = can(roles, "marketing:manage");
  const canApprove = can(roles, "marketing:approve");
  const approved = b.facts.filter((f) => f.status === "APROVADO").length;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/marketing/marca" className="font-semibold text-accent-dark underline">
          ← Marcas
        </Link>
      </p>
      <AdminPageTitle title={b.name} subtitle="Kit da marca: identidade visual e informações oficiais" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Identidade visual</h2>
            {canManage ? (
              <BrandForm
                brand={{
                  id: b.id,
                  name: b.name,
                  website: b.website ?? "",
                  about: b.about ?? "",
                  colors: b.colors,
                  headingFont: b.headingFont ?? "",
                  bodyFont: b.bodyFont ?? "",
                  ctas: b.ctas,
                  socials: b.socials,
                }}
              />
            ) : (
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-ink-soft">Site</dt>
                  <dd>{b.website ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Cores</dt>
                  <dd>{b.colors.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Fontes</dt>
                  <dd>{[b.headingFont, b.bodyFont].filter(Boolean).join(" / ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Chamadas para ação</dt>
                  <dd>{b.ctas.join(" · ") || "—"}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card data-testid="informacoes">
            <h2 className="font-display text-base font-semibold text-ink">Produtos, serviços, benefícios e preços</h2>
            <p className="mt-1 text-sm text-ink-soft">
              A IA só usa informações <strong>aprovadas</strong> ({approved} de {b.facts.length}). Ela nunca inventa preços,
              descontos, profissionais ou benefícios que não estejam aqui. Quem aprova: Gestor ou Superadministrador.
            </p>
            {b.facts.length ? (
              <ul className="mt-4 grid gap-3">
                {b.facts.map((f) => (
                  <li key={f.id} className="rounded-lg border border-line p-3" data-testid={`fato-${f.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink-soft uppercase">{BRAND_FACT_KIND_LABELS[f.kind]}</p>
                        <p className="font-semibold">{f.title}</p>
                        {f.detail ? <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{f.detail}</p> : null}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          f.status === "APROVADO" ? "bg-saving-50 text-saving-dark" : "bg-amber-50 text-amber-900",
                        )}
                      >
                        {f.status === "APROVADO" ? "Aprovada" : "Rascunho (a IA não usa)"}
                      </span>
                    </div>
                    {canManage ? (
                      <div className="mt-2">
                        <FactButtons brandId={b.id} factId={f.id} canApprove={canApprove} approved={f.status === "APROVADO"} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-ink-soft">Nenhuma informação cadastrada.</p>
            )}
            {canManage ? (
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink">Cadastrar informação oficial</summary>
                <div className="mt-2">
                  <AddFactForm id={b.id} />
                </div>
              </details>
            ) : null}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Logomarca</h2>
            <MediaPreview
              asset={b.logo ? { ...b.logo, kind: "IMAGEM" } : null}
              alt={`Logomarca de ${b.name}`}
              className="mt-3 h-40 w-full rounded-lg"
            />
            {canManage && storageReady() ? (
              <div className="mt-4">
                <LogoForm id={b.id} />
              </div>
            ) : null}
          </Card>
          {canManage ? (
            <Card>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-red-dark">Excluir marca</summary>
                <div className="mt-3">
                  <DeleteBrandForm id={b.id} name={b.name} />
                </div>
              </details>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
