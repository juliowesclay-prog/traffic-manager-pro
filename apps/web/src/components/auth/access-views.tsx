import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can } from "@tmp/core";
import Link from "next/link";
import { BrandMark } from "@/components/admin/brand-mark";
import { getSiteSettings } from "@/lib/settings";
import { getAuth } from "@/server/auth";
import { devPrefilledAdminLogin } from "@/server/dev-login";
import { StaffLoginForm } from "@/app/admin/forms";

/** Telas de acesso do painel (/admin). */
type Area = "admin";
const BASE: Record<Area, string> = { admin: "/admin" };
const TEXT: Record<Area, { badge: string; title: string; intro: string }> = {
  admin: {
    badge: "Painel administrativo",
    title: "Entrar no painel",
    intro: "Acesso exclusivo da equipe. Entre com seu e-mail e senha.",
  },
};

export async function AccessShell({ area, children }: { area: Area; children: ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <>
      <header className="bg-side">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" className="rounded-lg">
            <BrandMark name={settings.name} />
          </Link>
          <span className="rounded-full bg-side-2 px-3 py-1 text-xs font-semibold text-side-ink">
            {TEXT[area].badge}
          </span>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10 outline-none sm:px-6">
        {children}
      </main>
    </>
  );
}

export async function LoginView({ area }: { area: Area }) {
  const auth = await getAuth();
  const base = BASE[area];
  if (auth && can(auth.roles, "admin:access")) {
    redirect(base);
  }
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl font-semibold text-ink">{TEXT[area].title}</h1>
      <p className="mt-2 text-lg text-ink-soft">{TEXT[area].intro}</p>
      <div className="mt-8">
        <StaffLoginForm area={area} testLogin={await devPrefilledAdminLogin()} />
      </div>
    </div>
  );
}
