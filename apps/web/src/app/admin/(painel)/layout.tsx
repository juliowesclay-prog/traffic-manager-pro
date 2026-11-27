import { KeyRound, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { can, ROLE_LABELS } from "@tmp/core";
import { buttonClasses } from "@tmp/ui";
import { AdminNavLinks } from "@/components/admin/admin-nav";
import { ADMIN_NAV } from "@/components/admin/nav-items";
import { logoutAction } from "@/lib/actions";
import { getSiteSettings } from "@/lib/settings";
import { requireStaff } from "@/server/auth";
import { activeCompany, companiesOf } from "@/server/company";
import { CompanySwitcher } from "./company-switcher";

/** Casca do painel: menu lateral (desktop) ou menu recolhível (celular), só com o que o perfil pode ver. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { user, roles } = await requireStaff("admin:access", { allowPasswordChange: true });
  const settings = await getSiteSettings();
  const [companies, active] = await Promise.all([companiesOf(user), activeCompany()]);
  const switcher = user.mustChangePassword ? null : (
    <CompanySwitcher companies={companies.map(({ id, name }) => ({ id, name }))} activeId={active?.id ?? null} />
  );
  const items = user.mustChangePassword
    ? []
    : ADMIN_NAV.filter((i) => can(roles, i.permission)).map(({ href, label, icon }) => ({
        href,
        label,
        icon,
      }));

  const account = (
    <div className="grid gap-2 border-t border-line pt-4">
      <p className="px-2 text-sm text-ink-soft">
        <span className="block font-bold text-ink">{user.name}</span>
        {roles.map((r) => ROLE_LABELS[r]).join(", ")}
      </p>
      <Link href="/admin/conta" className={buttonClasses("ghost", "md", "justify-start px-2 text-base")}>
        <KeyRound aria-hidden="true" className="size-5" />
        <span>Minha senha</span>
      </Link>
      <form action={logoutAction}>
        <input type="hidden" name="destino" value="admin" />
        <button type="submit" className={buttonClasses("ghost", "md", "w-full justify-start px-2 text-base")}>
          <LogOut aria-hidden="true" className="size-5" />
          <span>Sair</span>
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden border-r border-line bg-white p-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:overflow-y-auto">
        <Link href="/admin" className="rounded-lg">
          <img
            src={settings.logoUrl}
            alt={`${settings.name} — painel`}
            className="h-12 w-auto"
            width={900}
            height={302}
          />
        </Link>
        {switcher}
        <nav aria-label="Painel" className="flex-1">
          <AdminNavLinks items={items} />
        </nav>
        {account}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <Link href="/admin" className="rounded-lg">
          <img
            src={settings.logoUrl}
            alt={`${settings.name} — painel`}
            className="h-10 w-auto"
            width={900}
            height={302}
          />
        </Link>
        <details className="relative">
          <summary
            className={buttonClasses("primary", "md", "list-none px-4 [&::-webkit-details-marker]:hidden")}
          >
            <Menu aria-hidden="true" className="size-5" />
            <span>Menu</span>
          </summary>
          <div className="absolute right-0 mt-3 grid w-[min(18rem,calc(100vw-2rem))] gap-4 rounded-2xl border border-line bg-white p-3 shadow-card">
            {switcher}
            <nav aria-label="Painel">
              <AdminNavLinks items={items} />
            </nav>
            {account}
          </div>
        </details>
      </header>

      <main id="conteudo" tabIndex={-1} className="min-w-0 px-4 py-8 outline-none sm:px-8">
        {children}
      </main>
    </div>
  );
}
