import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  can,
  META_REQUIRED_SCOPES,
  META_SCOPE_LABELS,
  META_SCOPES,
  metaAccountStatusLabel,
  metaAccountUsable,
} from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { trafficOverview } from "@/server/traffic/connection";
import { ConnectMetaButton, DisconnectMetaForm, RefreshAccountsButton, SelectAccountButton } from "./forms";

export const metadata: Metadata = { title: "Gestor de Tráfego IA" };

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Mensagens do retorno da Meta: o endereço traz só um código fixo; o texto é daqui. */
const RESULTS: Record<string, { ok: boolean; text: string }> = {
  conectado: {
    ok: true,
    text: "Conexão com a Meta concluída. Escolha abaixo a conta de anúncios da empresa.",
  },
  cancelado: { ok: false, text: "A autorização foi cancelada na Meta. Nada foi conectado." },
  invalido: {
    ok: false,
    text: "Não foi possível confirmar a autorização. Comece de novo pelo botão Conectar.",
  },
  expirou: { ok: false, text: "A autorização venceu ou já foi usada. Comece de novo pelo botão Conectar." },
  permissoes: {
    ok: false,
    text: "Faltou autorizar a leitura e o gerenciamento de anúncios. Conecte de novo e mantenha essas opções marcadas.",
  },
  recusado: { ok: false, text: "A Meta não concluiu a autorização. Tente de novo." },
  indisponivel: { ok: false, text: "Não foi possível falar com a Meta agora. Tente de novo em instantes." },
};

const NEXT_STEPS = [
  ["8.5", "IA analista", "diagnóstico e sugestões explicadas, a partir dos dados reais"],
  ["8.6", "Ações com aprovação", "pausar, reativar e ajustar orçamento; aumentar gasto só com autorização"],
] as const;

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string }>;
}) {
  const { roles } = await requireCompanyStaff("traffic:read");
  const canManage = can(roles, "traffic:manage");
  const q = await searchParams;
  const result = q.resultado ? RESULTS[q.resultado] : undefined;
  const o = await trafficOverview();
  const c = o.connection;
  const selected = c?.accounts.find((a) => a.selected);

  return (
    <>
      <AdminPageTitle
        title="Gestor de Tráfego IA"
        subtitle="Anúncios do Facebook e do Instagram ligados às vendas reais da empresa"
      />

      {result ? (
        <p
          role="status"
          data-testid="resultado-conexao"
          className={cn(
            "mb-6 rounded-xl border p-4 text-base font-bold",
            result.ok
              ? "border-saving/40 bg-saving-50 text-saving-dark"
              : "border-red/40 bg-red-50 text-red-dark",
          )}
        >
          {result.text}
        </p>
      ) : null}

      {o.provider === "simulado" ? (
        <p
          role="note"
          className="mb-6 rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900"
        >
          DEMO — integração SIMULADA (ambiente de testes). As contas e números são de demonstração; nada fala
          com a Meta de verdade.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card data-testid="conexao-meta">
          <h2 className="font-display text-base font-semibold text-ink">Conexão com a Meta</h2>
          {!o.provider ? (
            <div className="mt-3 grid gap-2 text-base">
              <p>A integração ainda não foi configurada neste servidor.</p>
              <p className="text-ink-soft">
                Falta o app da Meta (ID e segredo) nas configurações do servidor — veja docs/INTEGRACOES.md.
                Endereço de retorno para cadastrar no app: <code className="break-all">{o.redirectUri}</code>
              </p>
            </div>
          ) : c ? (
            <div className="mt-3 grid gap-3 text-base">
              <p className="flex items-start gap-2 font-bold text-saving-dark">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                Conectado como {c.metaUserName} desde {when(c.connectedAt)}
              </p>
              <p>
                Validade da chave:{" "}
                {c.health.state === "sem_validade" ? (
                  "não vence"
                ) : c.health.state === "vencido" ? (
                  <strong className="text-red-dark">vencida — conecte de novo</strong>
                ) : (
                  <>
                    até {c.tokenExpiresAt ? day(c.tokenExpiresAt) : "—"} (
                    {"daysLeft" in c.health ? c.health.daysLeft : 0} dias)
                  </>
                )}
              </p>
              {c.health.state === "vence_em_breve" || c.health.state === "vencido" || c.lastError ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 font-bold text-red-dark"
                >
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  {c.lastError ??
                    (c.health.state === "vencido"
                      ? "A chave de acesso venceu. Conecte de novo para continuar."
                      : `A chave de acesso vence em ${"daysLeft" in c.health ? c.health.daysLeft : 0} dia(s). Conecte de novo para renovar.`)}
                </p>
              ) : null}
              <div>
                <p className="font-bold text-navy">Permissões concedidas</p>
                <ul className="mt-1 grid gap-1">
                  {META_SCOPES.map((s) => (
                    <li key={s} className={c.scopes.includes(s) ? "" : "text-ink-soft line-through"}>
                      {c.scopes.includes(s) ? "✓" : "—"} {META_SCOPE_LABELS[s]}
                      {META_REQUIRED_SCOPES.includes(s as (typeof META_REQUIRED_SCOPES)[number])
                        ? ""
                        : " (opcional)"}
                    </li>
                  ))}
                </ul>
              </div>
              {c.lastCheckedAt ? (
                <p className="text-sm text-ink-soft">Última consulta à Meta: {when(c.lastCheckedAt)}</p>
              ) : null}
              {canManage ? (
                <div className="mt-2 grid gap-4 border-t border-line pt-4">
                  <ConnectMetaButton label="Conectar de novo (renovar a chave)" />
                  <DisconnectMetaForm />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 grid gap-3 text-base">
              {o.disconnectWarning ? (
                <p role="alert" className="rounded-2xl bg-red-50 p-3 font-bold text-red-dark">
                  {o.disconnectWarning}
                </p>
              ) : null}
              <p>
                Ainda não conectado. Ao conectar, você entra na sua conta da Meta e autoriza o Traffic Manager
                Pro a <strong>ler</strong> e <strong>gerenciar</strong> os anúncios. Nenhuma alteração que
                aumente gastos é feita sem aprovação aqui no painel.
              </p>
              {canManage ? (
                <ConnectMetaButton label="Conectar com a Meta" />
              ) : (
                <p className="text-ink-soft">
                  Peça a alguém com o perfil Marketing ou Superadmin para conectar.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card data-testid="contas-anuncio">
          <h2 className="font-display text-base font-semibold text-ink">Conta de anúncios da empresa</h2>
          {c ? (
            <>
              <p className="mt-1 text-base text-ink-soft">
                {selected ? (
                  <>
                    Em uso: <strong className="text-navy">{selected.name}</strong> ({selected.accountId})
                  </>
                ) : (
                  "Nenhuma conta escolhida ainda. Escolha a conta que veicula os anúncios desta empresa."
                )}
              </p>
              {c.accounts.length ? (
                <ul className="mt-4 grid gap-3">
                  {c.accounts.map((a) => (
                    <li
                      key={a.id}
                      data-testid={`conta-${a.accountId}`}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3",
                        a.selected ? "border-accent bg-accent-50" : "border-line",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-bold break-words">
                          {a.name}
                          {a.selected ? <span className="ml-2 text-sm text-navy">· em uso</span> : null}
                        </span>
                        <span className="block text-sm text-ink-soft">
                          {a.accountId} · {a.currency} · {a.timezone} ·{" "}
                          {metaAccountStatusLabel(a.accountStatus)}
                          {a.businessName ? ` · ${a.businessName}` : ""}
                        </span>
                      </span>
                      {canManage && !a.selected && metaAccountUsable(a.accountStatus) ? (
                        <SelectAccountButton id={a.id} name={a.name} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4">
                  A Meta não mostrou nenhuma conta de anúncios para este usuário. Confira se ele tem acesso à
                  conta no Gerenciador de Negócios.
                </p>
              )}
              {canManage ? (
                <div className="mt-4">
                  <RefreshAccountsButton />
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-base text-ink-soft">
              As contas aparecem aqui depois da conexão com a Meta.
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="font-display text-base font-semibold text-ink">Próximas etapas do módulo</h2>
        <ul className="mt-3 grid gap-2">
          {NEXT_STEPS.map(([n, t, d]) => (
            <li key={n}>
              <strong>
                {n} {t}:
              </strong>{" "}
              <span className="text-ink-soft">{d}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
