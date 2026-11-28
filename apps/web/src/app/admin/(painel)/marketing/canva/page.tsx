import type { Metadata } from "next";
import { can } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { CANVA_FORMATS, canvaStatus, listDesigns } from "@/server/marketing/canva";
import { ConnectCanva, DisconnectCanva, ImportDesign } from "./forms";

export const metadata: Metadata = { title: "Canva" };

const RESULT: Record<string, { ok: boolean; text: string }> = {
  conectado: { ok: true, text: "Canva conectado." },
  cancelado: { ok: false, text: "A conexão foi cancelada no Canva." },
  invalido: { ok: false, text: "Não foi possível confirmar a autorização. Comece de novo." },
  expirou: { ok: false, text: "A autorização venceu ou já foi usada. Comece de novo." },
  recusado: { ok: false, text: "O Canva recusou a autorização. Tente de novo." },
};

/** Canva (Etapa 5): conecta a conta da pessoa e importa designs prontos para a biblioteca. */
export default async function CanvaPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string; mais?: string }>;
}) {
  const { user, roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canManage = can(roles, "marketing:manage");
  const st = await canvaStatus(user.id);
  const result = sp.resultado ? RESULT[sp.resultado] : undefined;
  const list = st.connected && canManage ? await listDesigns(user.id, sp.mais?.slice(0, 500)) : null;
  const formats = st.mode === "simulado" ? { png: CANVA_FORMATS.png } : CANVA_FORMATS;

  return (
    <>
      <AdminPageTitle
        title="Canva"
        subtitle="Traga para a biblioteca os designs que você já fez no Canva, como imagem, carrossel ou vídeo."
      />
      <div className="grid gap-6">
        {result ? (
          <p
            role="status"
            className={`rounded-lg p-3 text-sm font-semibold ${result.ok ? "bg-saving-50 text-saving-dark" : "bg-amber-50 text-amber-900"}`}
          >
            {result.text}
          </p>
        ) : null}
        <Card data-testid="canva-conexao">
          {!st.mode ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              A integração com o Canva ainda não foi configurada. É preciso criar o app no Canva Developers e
              colocar as chaves no servidor (veja docs/MARKETING-IA.md).
            </p>
          ) : !canManage ? (
            <p>Seu perfil só visualiza. Peça a um Gestor ou à equipe de Marketing para importar.</p>
          ) : st.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                Sua conta do Canva está conectada{st.mode === "simulado" ? " (Canva simulado — DEMO)" : ""}.
                Cada pessoa conecta a própria conta.
              </p>
              <DisconnectCanva />
            </div>
          ) : (
            <div className="grid gap-3">
              <p>
                Conecte a sua conta do Canva para listar seus designs. O sistema só lê e exporta; nada é
                alterado no Canva.
                {st.mode === "simulado" ? " (Canva simulado — DEMO)" : ""}
              </p>
              <ConnectCanva />
            </div>
          )}
        </Card>

        {list ? (
          <Card data-testid="canva-designs">
            <h2 className="font-display text-base font-semibold text-ink">Seus designs</h2>
            {!list.ok ? (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                {list.message}
              </p>
            ) : list.designs.length ? (
              <>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.designs.map((d) => (
                    <li key={d.id} className="grid gap-3 rounded-lg border border-line p-3">
                      {d.thumbnailUrl ? (
                        <img
                          src={d.thumbnailUrl}
                          alt=""
                          className="aspect-square w-full rounded bg-canvas object-contain"
                        />
                      ) : (
                        <div className="grid aspect-square w-full place-items-center rounded bg-canvas text-sm text-ink-soft">
                          Sem miniatura
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">{d.title}</p>
                        <p className="text-sm text-ink-soft">
                          {d.pageCount ? `${d.pageCount} página(s)` : ""}
                          {d.editUrl ? (
                            <>
                              {" · "}
                              <a
                                href={d.editUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent-text underline"
                              >
                                Abrir no Canva
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <ImportDesign id={d.id} title={d.title} formats={formats} />
                    </li>
                  ))}
                </ul>
                {list.next ? (
                  <p className="mt-4">
                    <a
                      href={`/admin/marketing/canva?mais=${encodeURIComponent(list.next)}`}
                      className="font-semibold text-accent-text underline"
                    >
                      Ver mais designs
                    </a>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-ink-soft">Nenhum design encontrado na sua conta do Canva.</p>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
