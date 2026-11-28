import type { Metadata } from "next";
import Link from "next/link";
import { AI_KEY_PROVIDERS, can } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { aiKeyStatus, modelsForSavedKey } from "@/server/ai-credentials";
import { requireCompanyStaff } from "@/server/auth";
import { aiProviderName } from "@/server/traffic/ai";
import { AiKeyForm, RemoveAiKey } from "./forms";

export const metadata: Metadata = { title: "Inteligência artificial" };

const when = (d: Date | null) =>
  d
    ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "—";

/** Configuração da IA da empresa: a chave de API do Claude ou do ChatGPT do próprio cliente. */
export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ removida?: string }>;
}) {
  const sp = await searchParams;
  const { company, roles } = await requireCompanyStaff("traffic:read");
  const canManage = can(roles, "traffic:approve");
  const [st, platform] = [await aiKeyStatus(), aiProviderName()];
  const models = st && canManage ? await modelsForSavedKey() : [];

  return (
    <>
      <AdminPageTitle
        title="Inteligência artificial"
        subtitle={`Conecte o Claude ou o ChatGPT de ${company.name} para usar a IA analista. O uso é pago direto na conta da sua empresa.`}
      />
      <div className="grid gap-6">
        {sp.removida && !st ? (
          <p role="status" className="rounded-2xl bg-saving-50 p-4 text-lg font-bold text-saving-dark">
            Chave removida. A empresa volta a usar a IA da plataforma, se estiver ligada.
          </p>
        ) : null}
        <Card data-testid="ia-situacao">
          <h2 className="font-display text-base font-semibold text-ink">Situação</h2>
          {st ? (
            <p className="mt-2">
              Usando a <strong>chave da sua empresa</strong>: {AI_KEY_PROVIDERS[st.provider].label}, modelo{" "}
              <strong>{st.model}</strong>, chave terminada em <strong>…{st.keyHint}</strong> (testada em{" "}
              {when(st.lastTestedAt)}).
            </p>
          ) : platform ? (
            <p className="mt-2">
              Usando a <strong>IA da plataforma</strong>
              {platform === "simulado" ? " (simulada — DEMO)" : ""}. Se preferir, cadastre a chave da sua
              empresa abaixo; o custo passa a ser cobrado direto na sua conta do Claude ou da OpenAI.
            </p>
          ) : (
            <p className="mt-2 rounded-lg bg-amber-50 p-3 font-semibold text-amber-900">
              Nenhuma IA ligada. Cadastre abaixo a chave de API do Claude ou do ChatGPT da sua empresa.
            </p>
          )}
          <ul className="mt-3 grid list-disc gap-1 pl-5 text-sm text-ink-soft">
            <li>A chave fica cifrada e nunca aparece de novo na tela, nem para a nossa equipe.</li>
            <li>
              Só vão para a IA números dos anúncios e nomes de campanhas. Nenhum dado pessoal de cliente.
            </li>
            <li>
              Usada na{" "}
              <Link href="/admin/trafego/ia" className="font-semibold text-accent-text underline">
                IA analista
              </Link>
              . A IA só sugere; nada é alterado na Meta sem uma pessoa aprovar.
            </li>
          </ul>
        </Card>

        {!st ? (
          <Card data-testid="ia-como-funciona">
            <h2 className="font-display text-base font-semibold text-ink">
              Como funciona (leva uns 10 minutos)
            </h2>
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                [
                  "Escolha a IA",
                  "Claude ou ChatGPT. Os dois funcionam bem; escolha a que a empresa já conhece.",
                ],
                ["Gere a chave", "Na conta de desenvolvedor da IA, com cartão e um limite de gasto mensal."],
                ["Cole e teste", "O sistema testa a chave e a IA analista passa a usar a sua conta."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-xl bg-canvas p-4">
                  <p className="font-display text-2xl font-bold text-accent-text">{i + 1}</p>
                  <p className="font-semibold text-ink">{t}</p>
                  <p className="text-sm text-ink-soft">{d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm font-semibold text-ink">Antes de começar, tenha em mãos:</p>
            <ul className="mt-1 grid list-disc gap-1 pl-5 text-sm text-ink-soft">
              <li>Um e-mail da empresa para criar a conta de desenvolvedor.</li>
              <li>Um cartão de crédito internacional (a cobrança é em dólar).</li>
              <li>O valor máximo que a empresa aceita gastar por mês com IA.</li>
            </ul>
          </Card>
        ) : null}

        <Card data-testid="ia-custos">
          <h2 className="font-display text-base font-semibold text-ink">Quanto custa</h2>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
            <li>
              Você paga <strong>só o que usar</strong>, direto para a Anthropic (Claude) ou para a OpenAI
              (ChatGPT). Não há mensalidade da IA no Traffic Manager Pro.
            </li>
            <li>
              Cada análise da IA analista custa, em média, <strong>menos de US$ 0,10</strong> (estimativa;
              varia com o modelo e o tamanho da conta de anúncios).
            </li>
            <li>
              Exemplo: 2 análises por dia, por um mês, ficam em torno de <strong>US$ 3 a US$ 6</strong>.
            </li>
            <li>
              Defina um <strong>limite mensal</strong> na conta da IA: se ele for atingido, a análise para de
              funcionar até o mês virar, sem cobrança extra.
            </li>
          </ul>
          <p className="mt-2 text-sm text-ink-soft">
            Preços oficiais:{" "}
            <a
              href={AI_KEY_PROVIDERS.claude.pricingUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent-text underline"
            >
              Claude
            </a>
            {" · "}
            <a
              href={AI_KEY_PROVIDERS.openai.pricingUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent-text underline"
            >
              ChatGPT
            </a>
          </p>
        </Card>

        {canManage ? (
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">
              {st ? "Trocar a chave ou o modelo" : "Cadastrar a chave da sua empresa"}
            </h2>
            <div className="mt-4">
              <AiKeyForm current={st ? { provider: st.provider, model: st.model } : null} models={models} />
            </div>
            {st ? (
              <div className="mt-6 border-t border-line pt-4">
                <RemoveAiKey />
              </div>
            ) : null}
          </Card>
        ) : (
          <Card>
            <p>Só o Gestor de tráfego ou o Superadministrador cadastra a chave da IA.</p>
          </Card>
        )}

        <Card data-testid="ia-duvidas">
          <h2 className="font-display text-base font-semibold text-ink">Dúvidas frequentes</h2>
          <div className="mt-2 grid gap-2 text-sm">
            {[
              [
                "Já pago o ChatGPT Plus ou o Claude Pro. Serve?",
                "Não. Essas assinaturas são para uso no site e no aplicativo. Sistemas como este só se conectam pela conta de desenvolvedor (API), que é cobrada à parte, por uso.",
              ],
              [
                "A chave fica segura?",
                "Sim. Ela é guardada cifrada, nunca volta a aparecer na tela e apenas o Gestor de tráfego ou o Superadministrador pode trocar ou remover.",
              ],
              [
                "Que dados vão para a IA?",
                "Só números dos anúncios (gasto, cliques, vendas) e nomes de campanhas. Nenhum dado pessoal de cliente.",
              ],
              [
                "A IA pode mexer nos meus anúncios?",
                "Não. Ela só sugere. Pausar, reativar ou mudar orçamento sempre passa por uma pessoa, e aumentar gasto precisa de aprovação.",
              ],
              [
                'Apareceu "chave recusada" ou "sem créditos". E agora?',
                "Confira se copiou a chave inteira e se a conta tem créditos. Se precisar, gere uma chave nova e cole de novo.",
              ],
            ].map(([q, a]) => (
              <details key={q} className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer font-semibold text-ink">{q}</summary>
                <p className="mt-2 text-ink-soft">{a}</p>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
