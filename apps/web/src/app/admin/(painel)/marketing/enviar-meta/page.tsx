import type { Metadata } from "next";
import Link from "next/link";
import { can, CREATIVE_KIND_LABELS } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { LinkButton } from "@/components/link-button";
import { MediaPreview } from "@/components/marketing/media-preview";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { approvedCreatives } from "@/server/marketing/creatives";
import { sendContext, submissionsFor } from "@/server/marketing/meta-send";
import { SendForm } from "./forms";

export const metadata: Metadata = { title: "Enviar para Meta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (d: Date | null) =>
  d
    ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "";
const STATUS: Record<string, string> = { ENVIANDO: "Enviando", ENVIADO: "Criado pausado", FALHOU: "Falhou" };

/** Enviar para Meta (Etapa 6): criativo aprovado → anúncio PAUSADO num conjunto existente. */
export default async function SendToMetaPage({
  searchParams,
}: {
  searchParams: Promise<{ criativo?: string; enviado?: string }>;
}) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canSend = can(roles, "marketing:approve");
  const [approved, history] = await Promise.all([approvedCreatives(), submissionsFor()]);
  const chosen = sp.criativo && UUID.test(sp.criativo) ? sp.criativo : null;

  let sendBox = null;
  const sent = sp.enviado && UUID.test(sp.enviado) ? history.find((h) => h.id === sp.enviado) : undefined;
  if (sent?.status === "ENVIADO")
    sendBox = (
      <p
        role="status"
        className="rounded-2xl bg-saving-50 p-4 text-lg font-bold text-saving-dark"
        data-testid="envio-ok"
      >
        Anúncio “{sent.adName}” criado na Meta, PAUSADO (código {sent.metaAdId}). Revise e ative no
        Gerenciador de Anúncios quando quiser.
      </p>
    );
  else if (chosen) {
    const c = await prisma.creative.findFirst({
      where: { id: chosen },
      include: {
        brand: { select: { website: true } },
        versions: {
          orderBy: { number: "desc" },
          take: 1,
          include: { assets: { where: { status: "PRONTO" }, orderBy: { position: "asc" } } },
        },
      },
    });
    const v = c?.versions[0];
    if (!c || !v) sendBox = <Card>Criativo não encontrado.</Card>;
    else if (c.status !== "APROVADO" || c.approvedVersion !== v.number)
      sendBox = (
        <Card>
          <p>
            “{c.name}” não está aprovado na versão atual. Só criativos aprovados vão para a Meta.{" "}
            <Link
              href={`/admin/marketing/biblioteca/${c.id}`}
              className="font-semibold text-accent-text underline"
            >
              Abrir o criativo
            </Link>
          </p>
        </Card>
      );
    else if (!canSend) sendBox = <Card>Só o Gestor e o Superadmin enviam criativos para a Meta.</Card>;
    else {
      const ctx = await sendContext();
      const spec = (v.spec ?? {}) as {
        tipo?: string;
        title?: string;
        subtitle?: string;
        pages?: { title?: string; text?: string }[];
      };
      const headline = spec.title ?? spec.pages?.[0]?.title ?? "";
      const primaryText = spec.subtitle ?? spec.pages?.[0]?.text ?? "";
      sendBox = (
        <Card data-testid="enviar-criativo">
          <h2 className="font-display text-base font-semibold text-ink">
            Enviar “{c.name}” ({CREATIVE_KIND_LABELS[c.kind]}, versão {v.number})
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {v.assets.slice(0, 4).map((a) => (
              <div key={a.id} className="w-32">
                <MediaPreview asset={a} alt={c.name} />
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-navy-50 p-3 text-sm">
            O anúncio é criado <strong>PAUSADO</strong>, dentro de um conjunto que já existe. Nada é ativado,
            nenhum orçamento é alterado e nenhum anúncio existente é modificado. Ative no Gerenciador de
            Anúncios quando quiser.
          </p>
          {!ctx.ready ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {ctx.reason}
            </p>
          ) : !ctx.adSets.length ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Nenhum conjunto de anúncios na conta {ctx.account.name}. Crie a campanha e o conjunto na Meta e
              sincronize no Gestor de Tráfego.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              <p className="text-sm text-ink-soft">
                Conta de anúncios: <strong>{ctx.account.name}</strong>
                {ctx.demo ? " (Meta simulada — DEMO, nada sai daqui)" : ""}
              </p>
              <SendForm
                creativeId={c.id}
                defaults={{
                  adName: c.name.slice(0, 120),
                  link: c.brand?.website ?? "",
                  headline,
                  primaryText,
                }}
                adSets={ctx.adSets}
                pages={ctx.pages}
                pagesError={ctx.pagesError}
              />
            </div>
          )}
        </Card>
      );
    }
  }

  return (
    <>
      <AdminPageTitle
        title="Enviar para Meta"
        subtitle="Criativos aprovados viram anúncios pausados numa campanha existente. Ativar é sempre decisão sua."
      />
      <div className="grid gap-6">
        {sendBox}
        <Card data-testid="aprovados">
          <h2 className="font-display text-base font-semibold text-ink">
            Criativos aprovados, prontos para envio
          </h2>
          {approved.length ? (
            <ul className="mt-3 grid gap-2">
              {approved.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
                >
                  <span>
                    <Link
                      href={`/admin/marketing/biblioteca/${c.id}`}
                      className="font-semibold text-accent-text underline"
                    >
                      {c.name}
                    </Link>
                    <span className="text-sm text-ink-soft">
                      {" "}
                      · {CREATIVE_KIND_LABELS[c.kind]} · versão {c.approvedVersion} aprovada em{" "}
                      {when(c.approvedAt)}
                    </span>
                  </span>
                  {canSend ? (
                    <LinkButton href={`/admin/marketing/enviar-meta?criativo=${c.id}`} variant="secondary">
                      Enviar
                    </LinkButton>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-soft">
              Nenhum criativo aprovado ainda. Aprove na{" "}
              <Link href="/admin/marketing/biblioteca" className="font-semibold text-accent-text underline">
                biblioteca
              </Link>
              .
            </p>
          )}
        </Card>
        <Card data-testid="historico-envios">
          <h2 className="font-display text-base font-semibold text-ink">Histórico de envios</h2>
          {history.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-ink-soft">
                  <tr>
                    <th className="py-2 pr-3">Quando</th>
                    <th className="py-2 pr-3">Criativo</th>
                    <th className="py-2 pr-3">Anúncio</th>
                    <th className="py-2 pr-3">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-line align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{when(h.createdAt)}</td>
                      <td className="py-2 pr-3">
                        {h.creative.name} (v{h.versionNumber})
                      </td>
                      <td className="py-2 pr-3">
                        {h.adName}
                        {h.metaAdId ? <span className="block text-ink-soft">código {h.metaAdId}</span> : null}
                        {h.isDemo ? <span className="block text-ink-soft">DEMO</span> : null}
                      </td>
                      <td className="py-2 pr-3">
                        <strong>{STATUS[h.status] ?? h.status}</strong>
                        {h.error ? <span className="block text-red-dark">{h.error}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-ink-soft">Nenhum envio ainda.</p>
          )}
        </Card>
      </div>
    </>
  );
}
