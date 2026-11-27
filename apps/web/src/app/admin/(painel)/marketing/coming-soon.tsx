import type { ReactNode } from "react";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { LinkButton } from "@/components/link-button";
import { MARKETING_SECTIONS } from "./sections";

/**
 * Seção que ainda não funciona: diz com clareza o que vai fazer e em qual etapa chega.
 * Sem botões falsos — só leva ao que já funciona (biblioteca e kit da marca).
 */
export function ComingSoon({
  href,
  what,
  needs,
  children,
}: {
  href: (typeof MARKETING_SECTIONS)[number]["href"];
  what: string[];
  needs: string;
  children?: ReactNode;
}) {
  const s = MARKETING_SECTIONS.find((x) => x.href === href)!;
  return (
    <>
      <AdminPageTitle title={s.label} subtitle={s.summary} />
      <Card data-testid="em-breve">
        <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm font-semibold text-ink">
          Em desenvolvimento: esta seção chega na Etapa {s.stage}.
        </p>
        <h2 className="mt-4 font-display text-base font-semibold text-ink">O que ela vai fazer</h2>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-base">
          {what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-soft">
          <strong>Depende de:</strong> {needs}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <LinkButton href="/admin/marketing/biblioteca">Abrir a biblioteca</LinkButton>
          <LinkButton href="/admin/marketing/marca" variant="secondary">
            Preencher o kit da marca
          </LinkButton>
        </div>
      </Card>
      {children}
    </>
  );
}
