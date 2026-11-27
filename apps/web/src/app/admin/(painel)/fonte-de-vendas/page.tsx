import type { Metadata } from "next";
import { Megaphone, ShoppingCart, UserPlus, Wallet } from "lucide-react";
import Link from "next/link";
import { can, formatBRL } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { KpiCard } from "@/components/admin/kpi-card";
import { requireCompanyStaff } from "@/server/auth";
import { salesSourceOverview } from "@/server/sales-source";

export const metadata: Metadata = { title: "Fonte de vendas" };

const when = (d: Date | null) =>
  d
    ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "nunca";

export default async function SalesSourcePage() {
  const { company, roles } = await requireCompanyStaff("traffic:read");
  const o = await salesSourceOverview();
  const url = `${(process.env.APP_URL ?? "http://localhost:3300").replace(/\/$/, "")}/api/v1/eventos`;
  const example = `curl -X POST ${url} \\
  -H "Authorization: Bearer SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"eventos":[
    {"tipo":"cadastro","id":"cliente-123","quando":"2026-11-26T10:00:00-03:00",
     "origem":"https://seusite.com.br/assinar?utm_source=facebook&utm_campaign=120200000001&fbclid=...",
     "clicado_em":"2026-11-26T09:58:00-03:00"},
    {"tipo":"venda","id":"pedido-987","cliente":"cliente-123","valor":49.90,"primeira":true},
    {"tipo":"estorno","id":"pedido-987"}
  ]}'`;
  return (
    <>
      <AdminPageTitle
        title="Fonte de vendas"
        subtitle={`Cadastros e vendas que os sistemas de ${company.name} enviam. É daqui que saem o CAC, o retorno e as conversões enviadas à Meta.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<UserPlus className="size-6" />}
          label="Cadastros (30 dias)"
          value={o.leads.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={<Megaphone className="size-6" />}
          label="Cadastros vindos da Meta"
          value={o.leadsMeta.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={<ShoppingCart className="size-6" />}
          label="Vendas (1ª compra, 30 dias)"
          value={o.sales.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={<Wallet className="size-6" />}
          label="Receita (30 dias)"
          value={formatBRL(o.revenue)}
        />
      </div>
      <p className="mt-4 text-ink-soft" data-testid="ultimo-envio">
        Último envio recebido: {when(o.lastReceivedAt)}
      </p>

      <Card className="mt-8 grid gap-4 p-6">
        <h2 className="font-display text-base font-semibold text-ink">Como conectar um sistema</h2>
        <ol className="grid list-decimal gap-2 pl-6">
          <li>
            {can(roles, "companies:manage") ? (
              <>
                Gere uma chave em{" "}
                <Link href={`/admin/empresas/${company.id}`} className="underline underline-offset-4">
                  Empresas → {company.name}
                </Link>
                .
              </>
            ) : (
              "Peça a um superadministrador uma chave da API para esta empresa."
            )}
          </li>
          <li>
            No site, guarde o endereço completo de entrada (com <code>utm_*</code> e <code>fbclid</code>)
            quando o visitante chega, e envie no cadastro como <code>origem</code>.
          </li>
          <li>
            Envie <code>cadastro</code> quando a pessoa se cadastra, <code>venda</code> quando um pagamento é
            confirmado e <code>estorno</code> se for devolvido. Reenviar o mesmo <code>id</code> não duplica.
          </li>
          <li>
            Nunca envie nome, CPF, telefone ou e-mail: o <code>id</code> é o código do cliente no seu sistema.
          </li>
        </ol>
        <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-sm text-white">{example}</pre>
        <p className="text-sm text-ink-soft">
          Nos anúncios da Meta, cole em &ldquo;Parâmetros de URL&rdquo;:{" "}
          <code>
            utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign={"{{campaign.id}}"}&amp;utm_term=
            {"{{adset.id}}"}&amp;utm_content={"{{ad.id}}"}
          </code>
        </p>
      </Card>
    </>
  );
}
