import type { Metadata } from "next";
import { randomBytes } from "node:crypto";
import { notFound } from "next/navigation";
import { buttonClasses } from "@prosed/ui";
import { metaProviderName, metaRedirectUri } from "@/server/traffic";

export const metadata: Metadata = { title: "Autorização simulada da Meta", robots: { index: false } };

/**
 * SOMENTE DESENVOLVIMENTO: imita a tela "Continuar como…" da Meta. Volta para o MESMO endereço de
 * retorno da Meta real (nunca para outro endereço), com um código simulado ou com "cancelado".
 */
export default async function SimulatedMetaAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; redirect_uri?: string }>;
}) {
  if (process.env.APP_ENV === "production" || metaProviderName() !== "simulado") notFound();
  const q = await searchParams;
  const state = q.state ?? "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(state) || q.redirect_uri !== metaRedirectUri()) notFound();
  const code = (kind: string) => `sim_code_${kind}_${randomBytes(9).toString("base64url")}`;

  return (
    <main id="conteudo" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <p className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950">
        AMBIENTE DE TESTES — autorização simulada da Meta. Nenhuma conta real é conectada.
      </p>
      <h1 className="font-display text-3xl font-extrabold text-navy">Conectar ao Prosed+ Saúde</h1>
      <p className="text-lg">
        O app <strong>Prosed+ Saúde</strong> quer ler e gerenciar suas contas de anúncio (Facebook e
        Instagram).
      </p>
      <form method="get" action={metaRedirectUri()} className="grid gap-3">
        <input type="hidden" name="state" value={state} />
        <button name="code" value={code("completo")} className={buttonClasses("primary", "lg")}>
          Autorizar
        </button>
        <button name="code" value={code("parcial")} className={buttonClasses("secondary", "lg")}>
          Autorizar sem a permissão de gerenciar anúncios
        </button>
      </form>
      <form method="get" action={metaRedirectUri()}>
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="error" value="access_denied" />
        <input type="hidden" name="error_reason" value="user_denied" />
        <button className={buttonClasses("secondary", "lg")}>Cancelar</button>
      </form>
    </main>
  );
}
