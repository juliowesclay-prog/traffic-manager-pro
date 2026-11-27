import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CAPI_EVENT_LABELS, CAPI_STATUS_LABELS, can, formatBRL } from "@prosed/core";
import { Card, cn } from "@prosed/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireStaff } from "@/server/auth";
import { activeConnection } from "@/server/traffic/connection";
import { conversionsOverview } from "@/server/traffic/conversions";
import { TrafficTabs } from "../tabs";
import { CapiSettingsForm, SendNowButton } from "./forms";

export const metadata: Metadata = { title: "Conversões" };

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const TONE = {
  ENVIADO: "bg-saving-50 text-saving-dark",
  PENDENTE: "bg-navy-50 text-navy",
  ERRO: "bg-red-50 text-red-dark",
  DESCARTADO: "bg-line text-ink-soft",
} as const;

export default async function ConversionsPage() {
  const { roles } = await requireStaff("traffic:read");
  const canManage = can(roles, "traffic:manage");
  const canApprove = can(roles, "traffic:approve");
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected) ?? null;
  const o = await conversionsOverview();
  const s = o.settings;

  return (
    <>
      <AdminPageTitle
        title="Conversões"
        subtitle="Avisar a Meta dos cadastros e vendas que vieram dos anúncios"
      />
      <TrafficTabs />

      {account?.isDemo ? (
        <p
          role="note"
          className="mb-6 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950"
        >
          DEMO — Meta simulada. Os eventos não saem do computador.
        </p>
      ) : null}

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-navy" />
          <div className="grid gap-2 text-base">
            <p>
              Quando alguém que <strong>clicou num anúncio</strong> se cadastra ou paga a primeira
              mensalidade, o Prosed avisa a Meta. Assim a Meta aprende quem compra e mostra os anúncios para
              pessoas parecidas.
            </p>
            <p>
              <strong>O que vai:</strong> o tipo (cadastro ou venda), a hora, o valor da venda, a página de
              entrada, o código do clique no anúncio e um número que identifica a pessoa{" "}
              <strong>embaralhado (hash)</strong>. <strong>Não vai:</strong> nome, CPF, telefone nem e-mail.
            </p>
            <p className="text-ink-soft">
              Quem não clicou num anúncio da Meta não é enviado. A Meta só aceita eventos de até 7 dias.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-6" data-testid="capi-config">
        <h2 className="text-xl font-bold text-navy">Configuração</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-base sm:grid-cols-3">
          <div>
            <dt className="text-sm text-ink-soft">Envio</dt>
            <dd className="font-bold" data-testid="capi-situacao">
              {s.enabled ? "Ligado" : "Desligado"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Conjunto de dados (pixel)</dt>
            <dd className="font-bold">{s.datasetId ?? "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Modo de teste</dt>
            <dd className="font-bold" data-testid="capi-teste">
              {s.testEventCode ? `Sim (${s.testEventCode}) — não conta nos anúncios` : "Não"}
            </dd>
          </div>
        </dl>
        {!account ? (
          <p className="mt-3 text-base">
            Sem conta de anúncios escolhida, nada é enviado.{" "}
            <Link href="/admin/trafego" className="font-bold text-navy underline">
              Ir para Conexão
            </Link>
          </p>
        ) : null}
        {canApprove ? (
          <details className="mt-3">
            <summary className="min-h-12 cursor-pointer py-3 font-bold text-navy">
              Alterar configuração
            </summary>
            <p className="mt-2 rounded-2xl bg-amber-50 p-3 text-base text-amber-950">
              Antes de ligar com dados reais, a política de privacidade precisa dizer que cadastros e vendas
              vindos de anúncios são informados à Meta (sem nome, CPF, telefone ou e-mail).
            </p>
            <CapiSettingsForm
              enabled={s.enabled}
              datasetId={s.datasetId ?? ""}
              testEventCode={s.testEventCode ?? ""}
            />
          </details>
        ) : (
          <p className="mt-3 text-base text-ink-soft">Só quem pode aprovar ações altera esta configuração.</p>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-xl font-bold text-navy">Últimos 30 dias</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-base sm:grid-cols-4" data-testid="capi-contagem">
          {(["ENVIADO", "PENDENTE", "ERRO", "DESCARTADO"] as const).map((st) => (
            <div key={st}>
              <dt className="text-sm text-ink-soft">{CAPI_STATUS_LABELS[st]}</dt>
              <dd className="text-2xl font-bold" data-testid={`capi-${st.toLowerCase()}`}>
                {o.count(st)}
              </dd>
            </div>
          ))}
        </dl>
        {canManage ? (
          <div className="mt-4">
            <p className="mb-2 text-base text-ink-soft">
              O envio é automático (junto da atualização periódica). Use o botão para enviar já.
            </p>
            <SendNowButton />
          </div>
        ) : null}
      </Card>

      <Card className="mt-6" data-testid="capi-eventos">
        <h2 className="text-xl font-bold text-navy">Eventos recentes</h2>
        {o.recent.length ? (
          <ul className="mt-3 grid gap-3">
            {o.recent.map((e) => (
              <li key={e.id} className="border-b border-line pb-3" data-testid={`evento-${e.id}`}>
                <p className="font-bold">
                  <span className={cn("mr-2 inline-block rounded-full px-3 py-0.5 text-sm", TONE[e.status])}>
                    {CAPI_STATUS_LABELS[e.status]}
                  </span>
                  {CAPI_EVENT_LABELS[e.kind]}
                  {e.valueCents != null ? ` · ${formatBRL(e.valueCents)}` : ""}
                </p>
                <p className="text-sm text-ink-soft">
                  {when(e.eventTime)}
                  {e.campaignExternalId ? ` · campanha ${e.campaignExternalId}` : ""}
                  {e.sentAt && e.status === "ENVIADO" ? ` · enviado em ${when(e.sentAt)}` : ""}
                  {e.testMode ? " · modo de teste" : ""}
                  {e.attempts > 1 ? ` · ${e.attempts} tentativas` : ""}
                  {e.isDemo ? " · DEMO" : ""}
                </p>
                {e.lastError && e.status !== "ENVIADO" ? (
                  <p className="text-sm font-bold text-red-dark">{e.lastError}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">Nenhum evento ainda.</p>
        )}
      </Card>
    </>
  );
}
