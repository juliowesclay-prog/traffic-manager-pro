"use client";

import { usePathname } from "next/navigation";
import { switchCompanyAction } from "./company-actions";

/** Seletor da empresa aberta. Mostra só as empresas que o usuário pode abrir. */
export function CompanySwitcher({
  companies,
  activeId,
}: {
  companies: { id: string; name: string }[];
  activeId: string | null;
}) {
  const pathname = usePathname();
  if (!companies.length) return null;
  return (
    <form action={switchCompanyAction} className="grid gap-2" data-testid="seletor-empresa">
      <label htmlFor="empresa-aberta" className="px-2 text-sm font-bold text-ink-soft">
        Empresa aberta
      </label>
      <input type="hidden" name="voltar" value={pathname} />
      <select
        id="empresa-aberta"
        name="companyId"
        defaultValue={activeId ?? undefined}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-12 rounded-xl border-2 border-line bg-white px-3 text-base font-bold text-navy"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="rounded-xl bg-navy px-3 py-2 font-bold text-white">
          Abrir
        </button>
      </noscript>
    </form>
  );
}
