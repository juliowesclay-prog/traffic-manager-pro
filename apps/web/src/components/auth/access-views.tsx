import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can } from "@tmp/core";
import { Alert } from "@tmp/ui";
import { Logo } from "@/components/logo";
import { getSiteSettings } from "@/lib/settings";
import { getAuth } from "@/server/auth";
import { devPrefilledAdminLogin } from "@/server/dev-login";
import { devPrefilledMfaCode } from "@/server/dev-mfa";
import { mfaEnrollmentData } from "@/server/staff";
import { StaffLoginForm, TotpForm } from "@/app/admin/forms";
import { requireStaffPendingMfa } from "@/app/admin/staff-step-guard";

/** Telas de acesso do painel (/admin). */
type Area = "admin";
const BASE: Record<Area, string> = { admin: "/admin" };
const TEXT: Record<Area, { badge: string; title: string; intro: string; lost: string }> = {
  admin: {
    badge: "Painel administrativo",
    title: "Entrar no painel",
    intro: "Acesso exclusivo da equipe. Depois da senha, pedimos o código do aplicativo autenticador.",
    lost: "Se perder o aparelho, peça a um superadministrador para reiniciar sua verificação.",
  },

};

export async function AccessShell({ area, children }: { area: Area; children: ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Logo src={settings.logoUrl} name={settings.name} className="h-10 w-auto" />
          <span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">
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
    redirect(
      auth.session.mfaVerified
        ? base
        : auth.user.mfaEnabledAt
          ? `${base}/verificar`
          : `${base}/mfa/configurar`,
    );
  }
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-3xl font-extrabold text-navy">{TEXT[area].title}</h1>
      <p className="mt-2 text-lg text-ink-soft">{TEXT[area].intro}</p>
      <div className="mt-8">
        <StaffLoginForm area={area} testLogin={await devPrefilledAdminLogin()} />
      </div>
    </div>
  );
}

export async function MfaVerifyView({ area }: { area: Area }) {
  const auth = await requireStaffPendingMfa(area);
  if (!auth.user.mfaEnabledAt) redirect(`${BASE[area]}/mfa/configurar`);
  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <h1 className="font-display text-3xl font-extrabold text-navy">Verificação em duas etapas</h1>
      <p className="text-lg text-ink-soft">
        Abra o aplicativo autenticador no celular e digite o código atual.
      </p>
      <TotpForm mode="verify" testCode={devPrefilledMfaCode(auth.user)} />
    </div>
  );
}

export async function MfaEnrollView({ area }: { area: Area }) {
  const auth = await requireStaffPendingMfa(area);
  if (auth.user.mfaEnabledAt) redirect(`${BASE[area]}/verificar`);
  const data = await mfaEnrollmentData();
  if (!data) redirect(`${BASE[area]}/entrar`);
  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-navy">Proteja sua conta</h1>
        <p className="mt-2 text-lg text-ink-soft">
          Usamos verificação em duas etapas. Faça isso uma única vez:
        </p>
      </div>
      <ol className="grid list-decimal gap-3 pl-6 text-lg">
        <li>
          Instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator ou
          Authy).
        </li>
        <li>No aplicativo, escolha “adicionar conta” e leia o QR Code abaixo.</li>
        <li>Digite o código de 6 números que aparecer no aplicativo.</li>
      </ol>
      <div className="flex flex-col items-start gap-4 rounded-3xl border border-line bg-white p-6 sm:flex-row sm:items-center">
        <img
          src={data.qrDataUrl}
          alt="QR Code para adicionar a conta no aplicativo autenticador"
          width={200}
          height={200}
        />
        <div>
          <p className="text-base text-ink-soft">
            Não consegue ler o QR Code? Digite esta chave no aplicativo:
          </p>
          <p
            className="mt-2 break-all font-mono text-lg font-bold tracking-wider text-navy"
            data-testid="mfa-secret"
          >
            {data.secret.match(/.{1,4}/g)?.join(" ")}
          </p>
        </div>
      </div>
      <Alert tone="info" urgent={false} title="Guarde o celular com o autenticador">
        Sem ele não é possível entrar. {TEXT[area].lost}
      </Alert>
      <TotpForm mode="enroll" />
    </div>
  );
}
