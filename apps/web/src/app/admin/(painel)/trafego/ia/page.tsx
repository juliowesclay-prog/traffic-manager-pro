import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, TrendingUp } from "lucide-react";
import { AI_SUGGESTION_LABELS, AI_SUGGESTION_TO_ACTION, can, type ReviewedAnalysis } from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { aiProviderName } from "@/server/traffic/ai";
import { AI_PERIODS, getAnalysis, listAnalyses } from "@/server/traffic/ai/analysis";
import { activeConnection } from "@/server/traffic/connection";
import { AnalyzeForm } from "../forms";
import { TrafficTabs } from "../tabs";

export const metadata: Metadata = { title: "IA analista" };

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const CONF = { baixa: "baixa", media: "média", alta: "alta" } as const;
const PRIO = { 1: "Fazer primeiro", 2: "Importante", 3: "Quando puder" } as const;

export default async function TrafficAiPage({
  searchParams,
}: {
  searchParams: Promise<{ analise?: string }>;
}) {
  const { roles } = await requireCompanyStaff("traffic:read");
  const canManage = can(roles, "traffic:manage");
  const q = await searchParams;
  const provider = aiProviderName();
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected) ?? null;
  const history = account ? await listAnalyses() : [];
  const selected = q.analise
    ? await getAnalysis(q.analise)
    : (history.find((h) => h.status === "OK") ?? null);
  const out = selected?.status === "OK" ? (selected.output as unknown as ReviewedAnalysis) : null;

  return (
    <>
      <AdminPageTitle title="IA analista" subtitle="Diagnóstico e sugestões sobre os anúncios, explicados" />
      <TrafficTabs />

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-navy" />
          <div className="grid gap-1 text-base">
            <p>
              A IA lê os números do período (investido, cliques, vendas, CAC) e os nomes das campanhas e
              anúncios. <strong>Nenhum dado pessoal de cliente</strong> (nome, CPF, telefone) é enviado.
            </p>
            <p>
              <strong>A IA só sugere.</strong> Nada é alterado na Meta pela IA. Pausar, reativar ou mudar
              orçamento é feito por uma pessoa, na aba Ações, com aprovação quando aumenta o gasto.
            </p>
          </div>
        </div>
      </Card>

      {!provider ? (
        <Card className="mt-6">
          <p className="text-lg">
            A IA analista ainda não foi configurada. A equipe técnica precisa da chave da API do Claude.
          </p>
        </Card>
      ) : !account ? (
        <Card className="mt-6">
          <p className="text-lg">
            Conecte a Meta e escolha a conta de anúncios para pedir uma análise.{" "}
            <Link href="/admin/trafego" className="font-bold text-navy underline">
              Ir para Conexão
            </Link>
          </p>
        </Card>
      ) : (
        <>
          {provider === "simulado" ? (
            <p
              role="note"
              className="mt-6 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950"
            >
              DEMO — IA simulada por regras fixas (não é o Claude). Não use para decisões.
            </p>
          ) : null}
          {canManage ? (
            <Card className="mt-6">
              <h2 className="text-xl font-bold text-navy">Nova análise</h2>
              <div className="mt-3">
                <AnalyzeForm periods={AI_PERIODS} defaultPeriod={7} />
              </div>
            </Card>
          ) : null}

          {selected?.status === "ERRO" ? (
            <Card className="mt-6" data-testid="analise-erro">
              <p role="alert" className="text-lg text-red-dark">
                A análise de {when(selected.createdAt)} não foi concluída: {selected.error}
              </p>
            </Card>
          ) : null}

          {out && selected ? (
            <section aria-labelledby="titulo-analise" className="mt-6 grid gap-6" data-testid="analise">
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="titulo-analise" className="text-xl font-bold text-navy">
                    Análise dos últimos {selected.periodDays} dias
                  </h2>
                  <p className="text-sm text-ink-soft">
                    {when(selected.createdAt)} ·{" "}
                    {selected.provider === "claude" ? `Claude (${selected.model})` : "simulada"}
                    {selected.isDemo ? " · DEMO" : ""}
                  </p>
                </div>
                <p className="mt-3 text-lg" data-testid="analise-resumo">
                  {out.resumo}
                </p>
              </Card>

              {out.diagnostico.length ? (
                <Card>
                  <h3 className="text-xl font-bold text-navy">Diagnóstico</h3>
                  <ol className="mt-3 grid gap-4">
                    {out.diagnostico.map((d, i) => (
                      <li key={i}>
                        <p className="font-bold">{d.titulo}</p>
                        <p className="text-base">{d.explicacao}</p>
                        {d.evidencias.length ? (
                          <ul className="mt-1 list-disc pl-6 text-sm text-ink-soft">
                            {d.evidencias.map((e, j) => (
                              <li key={j}>{e}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Card>
              ) : null}

              <Card>
                <h3 className="text-xl font-bold text-navy">Sugestões ({out.sugestoes.length})</h3>
                <ol className="mt-3 grid gap-3">
                  {out.sugestoes.map((s, i) => (
                    <li
                      key={i}
                      data-testid={`sugestao-${i}`}
                      className={cn(
                        "rounded-2xl border-2 p-4",
                        s.aumenta_gasto ? "border-amber-500 bg-amber-50" : "border-line bg-white",
                      )}
                    >
                      <p className="text-sm font-bold text-ink-soft">
                        {PRIO[s.prioridade]} · {AI_SUGGESTION_LABELS[s.tipo]} · confiança {CONF[s.confianca]}
                      </p>
                      <p className="mt-1 text-lg font-bold">{s.titulo}</p>
                      {s.alvo_nome ? (
                        <p className="text-sm text-ink-soft">
                          Em: {s.alvo_nome} <span className="font-mono">({s.alvo_id})</span>
                        </p>
                      ) : null}
                      <p className="mt-2 text-base">
                        <strong>Por quê:</strong> {s.porque}
                      </p>
                      <p className="text-base">
                        <strong>O que esperar:</strong> {s.impacto_esperado}
                      </p>
                      {s.aumenta_gasto ? (
                        <p
                          className="mt-2 flex items-center gap-2 font-bold text-amber-950"
                          data-testid="aumenta-gasto"
                        >
                          <TrendingUp aria-hidden="true" className="size-5" /> Aumenta o gasto: só com
                          aprovação de outra pessoa e dentro do teto.
                        </p>
                      ) : null}
                      {canManage && s.alvo_id && AI_SUGGESTION_TO_ACTION[s.tipo] ? (
                        <Link
                          href={`/admin/trafego/acoes?${new URLSearchParams({ alvo: s.alvo_id, tipo: AI_SUGGESTION_TO_ACTION[s.tipo]!, analise: selected.id }).toString()}#revisar`}
                          className="mt-3 inline-flex min-h-12 items-center rounded-xl border-2 border-navy px-4 font-bold text-navy"
                          data-testid="preparar-acao"
                        >
                          Preparar esta ação
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </Card>

              {out.limitacoes.length ? (
                <Card>
                  <h3 className="text-xl font-bold text-navy">Limites desta análise</h3>
                  <ul className="mt-3 list-disc pl-6 text-base">
                    {out.limitacoes.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card>
                {out.descartadas.length ? (
                  <details data-testid="descartadas">
                    <summary className="min-h-12 cursor-pointer py-3 font-bold text-navy">
                      Sugestões descartadas pelas travas ({out.descartadas.length})
                    </summary>
                    <ul className="list-disc pl-6 text-base">
                      {out.descartadas.map((d, i) => (
                        <li key={i}>
                          {d.titulo} — {d.motivo}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <details>
                  <summary className="min-h-12 cursor-pointer py-3 font-bold text-navy">
                    Ver os dados enviados à IA
                  </summary>
                  <pre
                    tabIndex={0}
                    className="max-h-96 overflow-auto rounded-xl bg-navy-50 p-3 text-sm whitespace-pre-wrap"
                    data-testid="dados-enviados"
                  >
                    {JSON.stringify(selected.input, null, 2)}
                  </pre>
                </details>
              </Card>
            </section>
          ) : null}

          {history.length ? (
            <Card className="mt-6">
              <h2 className="text-xl font-bold text-navy">Análises anteriores</h2>
              <ul className="mt-3 grid gap-2" data-testid="historico">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
                    <Link
                      href={`/admin/trafego/ia?analise=${h.id}`}
                      aria-current={selected?.id === h.id ? "true" : undefined}
                      className="inline-flex min-h-12 items-center font-bold text-navy underline"
                    >
                      {when(h.createdAt)} · {h.periodDays} dias
                    </Link>
                    <span className={cn("text-sm", h.status === "ERRO" ? "text-red-dark" : "text-ink-soft")}>
                      {h.status === "OK" ? "pronta" : h.status === "ERRO" ? "não concluída" : "em andamento"}
                      {h.isDemo ? " · DEMO" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <p className="mt-6 text-base text-ink-soft">Nenhuma análise pedida ainda.</p>
          )}
        </>
      )}
    </>
  );
}
