import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { MediaPreview } from "@/components/marketing/media-preview";
import { requireCompanyStaff } from "@/server/auth";
import { listBrands } from "@/server/marketing/brands";
import { CreateBrandForm } from "./forms";

export const metadata: Metadata = { title: "Kit da marca" };

export default async function BrandsPage() {
  const { roles, company } = await requireCompanyStaff("marketing:read");
  const brands = await listBrands();
  return (
    <>
      <AdminPageTitle
        title="Kit da marca"
        subtitle={`Identidade visual e informações oficiais de ${company.name}. A IA usa só o que estiver aqui.`}
      />
      {can(roles, "marketing:manage") ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Nova marca</h2>
          <CreateBrandForm />
        </Card>
      ) : null}
      {brands.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="marcas">
          {brands.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/marketing/marca/${b.id}`}
                className="flex h-full items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-card hover:border-accent"
              >
                <MediaPreview
                  asset={b.logo ? { ...b.logo, kind: "IMAGEM" } : null}
                  alt={`Logomarca de ${b.name}`}
                  className="size-16 shrink-0 rounded-lg"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{b.name}</p>
                  <p className="text-sm text-ink-soft">
                    {b._count.facts} informações · {b._count.creatives} criativos
                  </p>
                  {b.colors.length ? (
                    <p className="mt-1 flex gap-1" aria-label={`Cores: ${b.colors.join(", ")}`}>
                      {b.colors.map((c) => (
                        <span key={c} className="size-4 rounded-full border border-line" style={{ background: c }} />
                      ))}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-ink-soft">Nenhuma marca cadastrada nesta empresa ainda.</p>
        </Card>
      )}
    </>
  );
}
