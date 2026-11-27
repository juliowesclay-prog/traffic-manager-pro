import type { Metadata } from "next";
import Link from "next/link";
import { CREATIVE_STATUS_LABELS, type CreativeStatus } from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { libraryCounts } from "@/server/marketing/creatives";
import { SectionIcon } from "./section-icon";
import { MARKETING_SECTIONS, MARKETING_STAGE_DONE } from "./sections";

export const metadata: Metadata = { title: "Marketing" };

export default async function MarketingHome() {
  const { company } = await requireCompanyStaff("marketing:read");
  const counts = await libraryCounts();
  const shown: CreativeStatus[] = ["RASCUNHO", "EM_EDICAO", "AGUARDANDO_APROVACAO", "APROVADO", "ENVIADO_META"];
  return (
    <>
      <AdminPageTitle
        title="Marketing"
        subtitle={`Criação de artes, carrosséis e vídeos para ${company.name}, da ideia ao envio para a Meta`}
      />

      <Card className="mb-6" data-testid="mkt-resumo">
        <h2 className="font-display text-base font-semibold text-ink">Biblioteca de criativos</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {shown.map((s) => (
            <div key={s}>
              <dt className="text-sm text-ink-soft">{CREATIVE_STATUS_LABELS[s]}</dt>
              <dd className="text-2xl font-bold">{counts[s] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MARKETING_SECTIONS.map((s) => {
          const ready = s.stage <= MARKETING_STAGE_DONE;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex h-full flex-col gap-3 rounded-xl border border-line bg-white p-5 shadow-card transition-colors hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent-50 text-accent-dark">
                    <SectionIcon name={s.icon} className="size-5" />
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      ready ? "bg-saving-50 text-saving-dark" : "bg-navy-50 text-ink-soft",
                    )}
                  >
                    {ready ? "Disponível" : `Etapa ${s.stage}`}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-ink">{s.label}</h2>
                <p className="text-sm text-ink-soft">{s.summary}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
