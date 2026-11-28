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
        subtitle={`Qual IA ${company.name} usa na IA analista: a da plataforma ou o Claude/ChatGPT da própria empresa.`}
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
      </div>
    </>
  );
}
