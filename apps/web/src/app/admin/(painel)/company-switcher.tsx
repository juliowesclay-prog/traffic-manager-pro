"use client";

import { ChevronsUpDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { switchCompanyAction } from "./company-actions";

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Seletor da empresa aberta (topo do menu). Mostra só as empresas que o usuário pode abrir. */
export function CompanySwitcher({
  companies,
  activeId,
}: {
  companies: { id: string; name: string }[];
  activeId: string | null;
}) {
  const pathname = usePathname();
  if (!companies.length) return null;
  const active = companies.find((c) => c.id === activeId) ?? companies[0]!;
  return (
    <form action={switchCompanyAction} data-testid="seletor-empresa">
      <label
        htmlFor="empresa-aberta"
        className="mb-1.5 block px-1 text-[0.6875rem] font-semibold tracking-[0.07em] text-side-faint uppercase"
      >
        Empresa aberta
      </label>
      <input type="hidden" name="voltar" value={pathname} />
      <div className="relative flex items-center gap-2.5 rounded-xl border border-white/10 bg-side-2 p-2 hover:border-white/25 focus-within:ring-2 focus-within:ring-accent">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-white"
        >
          {initials(active.name)}
        </span>
        <select
          id="empresa-aberta"
          name="companyId"
          defaultValue={activeId ?? undefined}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="min-h-8 w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-white focus:outline-none [&>option]:text-ink"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 size-4 text-side-faint"
        />
      </div>
      <noscript>
        <button
          type="submit"
          className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white"
        >
          Abrir
        </button>
      </noscript>
    </form>
  );
}
