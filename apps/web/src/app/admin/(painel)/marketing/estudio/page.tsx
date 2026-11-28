import type { Metadata } from "next";
import Link from "next/link";
import { can, STUDIO_GOALS, type StudioInput } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { LinkButton } from "@/components/link-button";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { copywriterName } from "@/server/marketing/ai-text";
import { getGeneration, listGenerations } from "@/server/marketing/studio";
import { CopyButton, RefineForm, StudioForm } from "./forms";

export const metadata: Metadata = { title: "Estúdio IA" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function List({ title, items, testid }: { title: string; items: string[]; testid: string }) {
  if (!items.length) return null;
  return (
    <section className="grid gap-2" data-testid={testid}>
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <ul className="grid gap-2">
        {items.map((t, i) => (
          <li
            key={i}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line p-3"
          >
            <p className="min-w-0 flex-1 whitespace-pre-line">{t}</p>
            <CopyButton text={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Estúdio IA (Etapa 2): a IA escreve textos, ideias de arte, carrossel e roteiro com o kit da marca. */
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canManage = can(roles, "marketing:manage");
  const [brands, history, current] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listGenerations(15),
    sp.r && UUID.test(sp.r) ? getGeneration(sp.r) : null,
  ]);
  const provider = copywriterName();
  const o = current?.output;

  return (
    <>
      <AdminPageTitle
        title="Estúdio IA"
        subtitle="Peça anúncios, ideias de arte, carrosséis e roteiros. A IA usa só as informações aprovadas do kit da marca."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          {canManage ? (
            <Card>
              {provider === null ? (
                <p className="font-semibold">A IA do Estúdio ainda não foi configurada neste ambiente.</p>
              ) : (
                <>
                  {provider === "simulado" ? (
                    <p className="mb-4 rounded-lg bg-navy-50 px-3 py-2 text-sm font-semibold">
                      IA simulada (DEMO): os textos são montados por regras, sem custo. Ligue o Claude para
                      textos reais.
                    </p>
                  ) : null}
                  <StudioForm
                    brands={brands}
                    defaultBrand={current?.brandId ?? (brands.length === 1 ? brands[0]!.id : null)}
                  />
                </>
              )}
            </Card>
          ) : null}

          {current && o ? (
            <Card data-testid="resultado-estudio">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink">Resultado</h2>
                <p className="text-sm text-ink-soft">
                  {when(current.createdAt)} · {current.isDemo ? "DEMO · " : ""}
                  {current.model}
                </p>
              </div>
              <p className="mt-2">{o.resumo}</p>

              {current.policy.length || current.prices.length ? (
                <div
                  className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900"
                  data-testid="alertas-politica"
                >
                  <p className="font-semibold">Revise antes de usar:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {current.prices.map((p) => (
                      <li key={p}>
                        O valor {p} não está nas informações aprovadas do kit da marca. Remova ou cadastre e
                        aprove.
                      </li>
                    ))}
                    {current.policy.map((w) => (
                      <li key={w.motivo}>
                        “{w.trecho}”: {w.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {o.avisos.length ? (
                <ul className="mt-4 grid list-disc gap-1 pl-5 text-sm text-ink-soft" data-testid="avisos-ia">
                  {o.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-6 grid gap-6">
                <List title="Títulos" items={o.titulos} testid="titulos" />
                <List title="Textos principais" items={o.textos} testid="textos" />
                <List title="Chamadas para ação" items={o.chamadas} testid="chamadas" />

                {o.artes.length ? (
                  <section className="grid gap-2" data-testid="ideias-arte">
                    <h3 className="font-display text-sm font-semibold text-ink">Ideias de arte</h3>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {o.artes.map((a, i) => (
                        <li key={i} className="grid gap-2 rounded-lg border border-line p-3">
                          <p className="font-semibold">{a.titulo}</p>
                          {a.subtitulo ? <p className="text-sm">{a.subtitulo}</p> : null}
                          <p className="text-sm text-ink-soft">
                            Botão: {a.chamada || "—"}
                            {a.destaque ? ` · Destaque: ${a.destaque}` : ""}
                          </p>
                          <p className="text-xs text-ink-soft">Foto sugerida: {a.ideia_imagem}</p>
                          {canManage ? (
                            <LinkButton
                              href={`/admin/marketing/artes?geracao=${current.id}&ideia=${i}`}
                              variant="secondary"
                            >
                              Criar esta arte
                            </LinkButton>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {o.carrossel.paginas.length ? (
                  <section className="grid gap-2" data-testid="carrossel-ia">
                    <h3 className="font-display text-sm font-semibold text-ink">
                      Carrossel ({o.carrossel.paginas.length} páginas)
                    </h3>
                    <ol className="grid list-decimal gap-1 pl-5">
                      {o.carrossel.paginas.map((p, i) => (
                        <li key={i}>
                          <strong>{p.titulo}</strong>
                          {p.texto ? ` — ${p.texto}` : ""}
                        </li>
                      ))}
                    </ol>
                    {canManage ? (
                      <LinkButton
                        href={`/admin/marketing/carrossel?geracao=${current.id}`}
                        variant="secondary"
                        className="w-fit"
                      >
                        Criar este carrossel
                      </LinkButton>
                    ) : null}
                  </section>
                ) : null}

                {o.roteiro_video.cenas.length ? (
                  <section className="grid gap-2" data-testid="roteiro">
                    <h3 className="font-display text-sm font-semibold text-ink">Roteiro de vídeo</h3>
                    <p>
                      <strong>Gancho:</strong> {o.roteiro_video.gancho}
                    </p>
                    <ol className="grid gap-2">
                      {o.roteiro_video.cenas.map((c, i) => (
                        <li key={i} className="rounded-lg border border-line p-3 text-sm">
                          <p className="font-semibold">{c.tempo}</p>
                          <p>Fala: {c.fala}</p>
                          <p className="text-ink-soft">Imagem: {c.imagem}</p>
                        </li>
                      ))}
                    </ol>
                    <p>
                      <strong>Chamada:</strong> {o.roteiro_video.chamada}
                    </p>
                  </section>
                ) : null}
              </div>
              {canManage && provider ? (
                <div className="mt-6 border-t border-line pt-4">
                  <RefineForm id={current.id} />
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>

        <Card className="content-start">
          <h2 className="font-display text-base font-semibold text-ink">Pedidos recentes</h2>
          {history.length ? (
            <ul className="mt-3 grid gap-2" data-testid="historico-estudio">
              {history.map((h) => {
                const inp = h.input as unknown as StudioInput;
                return (
                  <li key={h.id}>
                    <Link
                      href={`/admin/marketing/estudio?r=${h.id}`}
                      className="font-semibold text-accent-text underline"
                    >
                      {(inp.assunto || inp.pedido || "Pedido").slice(0, 60)}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      {when(h.createdAt)} · {STUDIO_GOALS[inp.objetivo] ?? ""}
                      {h.parentId ? " · ajuste" : ""}
                      {h.isDemo ? " · DEMO" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Nenhum pedido ainda.</p>
          )}
        </Card>
      </div>
    </>
  );
}
