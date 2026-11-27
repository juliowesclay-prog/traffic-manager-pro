import { KeyRound, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { can, ROLE_LABELS } from "@tmp/core";
import { AdminNavLinks, type NavGroup } from "@/components/admin/admin-nav";
import { BrandMark } from "@/components/admin/brand-mark";
import { ADMIN_NAV_GROUPS } from "@/components/admin/nav-items";
import { logoutAction } from "@/lib/actions";
import { getSiteSettings } from "@/lib/settings";
import { requireStaff } from "@/server/auth";
import { activeCompany, companiesOf } from "@/server/company";
import { CompanySwitcher } from "./company-switcher";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * Casca do painel: menu lateral escuro (desktop) ou barra com menu recolhível (celular).
 * Ordem do menu: marca, empresa aberta, seções (só o que o perfil pode ver) e conta.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { user, roles } = await requireStaff("admin:access", { allowPasswordChange: true });
  const settings = await getSiteSettings();
  const [companies, active] = await Promise.all([companiesOf(user), activeCompany()]);
  const switcher = user.mustChangePassword ? null : (
    <CompanySwitcher
      companies={companies.map(({ id, name }) => ({ id, name }))}
      activeId={active?.id ?? null}
    />
  );
  const groups: NavGroup[] = user.mustChangePassword
    ? []
    : ADMIN_NAV_GROUPS.map((g) => ({
        label: g.label,
        items: g.items
          .filter((i) => can(roles, i.permission))
          .map(({ href, label, icon }) => ({ href, label, icon })),
      })).filter((g) => g.items.length > 0);

  const account = (
    <div className="grid gap-1 border-t border-white/10 pt-4">
      <div className="flex items-center gap-2.5 px-1 pb-2">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-side-2 text-xs font-bold text-side-ink"
        >
          {initials(user.name)}
        </span>
        <p className="min-w-0 text-xs leading-snug text-side-faint">
          <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
          {roles.map((r) => ROLE_LABELS[r]).join(", ")}
        </p>
      </div>
      <Link
        href="/admin/conta"
        className="flex min-h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium text-side-ink hover:bg-side-2 hover:text-white"
      >
        <KeyRound aria-hidden="true" className="size-[18px] opacity-75" />
        <span>Minha senha</span>
      </Link>
      <form action={logoutAction}>
        <input type="hidden" name="destino" value="admin" />
        <button
          type="submit"
          className="flex min-h-10 w-full items-center gap-3 rounded-[9px] px-3 text-sm font-medium text-side-ink hover:bg-side-2 hover:text-white"
        >
          <LogOut aria-hidden="true" className="size-[18px] opacity-75" />
          <span>Sair</span>
        </button>
      </form>
    </div>
  );

  const home = (
    <Link href="/admin" className="rounded-lg">
      <BrandMark name={settings.name} />
    </Link>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--color-side)_16.5rem,var(--color-canvas)_16.5rem)]">
      <aside className="hidden bg-side px-3.5 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:overflow-y-auto">
        <div className="px-1.5">{home}</div>
        {switcher}
        <nav aria-label="Painel" className="flex-1">
          <AdminNavLinks groups={groups} />
        </nav>
        {account}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-side px-4 py-3 lg:hidden">
        {home}
        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-white/15 px-3.5 text-sm font-semibold text-white hover:bg-side-2 [&::-webkit-details-marker]:hidden">
            <Menu aria-hidden="true" className="size-5" />
            <span>Menu</span>
          </summary>
          <div className="absolute right-0 mt-3 grid max-h-[calc(100dvh-5rem)] w-[min(18rem,calc(100vw-2rem))] gap-5 overflow-y-auto rounded-2xl border border-white/10 bg-side p-3.5 shadow-2xl">
            {switcher}
            <nav aria-label="Painel">
              <AdminNavLinks groups={groups} />
            </nav>
            {account}
          </div>
        </details>
      </header>

      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-[84rem] min-w-0 px-4 py-6 outline-none sm:px-8 sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}
