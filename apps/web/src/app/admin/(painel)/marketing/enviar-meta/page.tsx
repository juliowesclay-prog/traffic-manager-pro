import type { Metadata } from "next";
import Link from "next/link";
import { CREATIVE_KIND_LABELS } from "@tmp/core";
import { Card } from "@tmp/ui";
import { requireCompanyStaff } from "@/server/auth";
import { approvedCreatives } from "@/server/marketing/creatives";
import { ComingSoon } from "../coming-soon";

export const metadata: Metadata = { title: "Enviar para Meta" };

const when = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

export default async function SendToMetaPage() {
  await requireCompanyStaff("marketing:read");
  const approved = await approvedCreatives();
  return (
    <ComingSoon
      href="/admin/marketing/enviar-meta"
      what={[
        "Escolher um criativo aprovado, a conta de anúncios, a campanha e o conjunto compatível.",
        "Informar nome do anúncio, texto, título, link e chamada para ação, ver a prévia e confirmar.",
        "O anúncio nasce PAUSADO. Nunca troca o criativo de um anúncio existente, nunca ativa sozinho e não mexe no orçamento.",
        "Registra o ID e a resposta da Meta; se a Meta recusar, mostra o motivo.",
      ]}
      needs="app real da Meta aprovado (Fase 2) e permissão de criar anúncios na conta."
    >
      <Card className="mt-6" data-testid="aprovados">
        <h2 className="font-display text-base font-semibold text-ink">Criativos aprovados, prontos para envio</h2>
        {approved.length ? (
          <ul className="mt-3 grid gap-2">
            {approved.map((c) => (
              <li key={c.id} className="border-b border-line pb-2">
                <Link href={`/admin/marketing/biblioteca/${c.id}`} className="font-semibold text-accent-dark underline">
                  {c.name}
                </Link>
                <span className="text-sm text-ink-soft">
                  {" "}
                  · {CREATIVE_KIND_LABELS[c.kind]} · versão {c.approvedVersion} aprovada em {when(c.approvedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">Nenhum criativo aprovado ainda.</p>
        )}
      </Card>
    </ComingSoon>
  );
}
