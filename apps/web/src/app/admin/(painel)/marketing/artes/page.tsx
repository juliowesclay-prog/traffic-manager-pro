import type { Metadata } from "next";
import { can, type ArtSpec, type StudioOutput } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { ArtEditor } from "@/components/marketing/art-editor";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { storageReady } from "@/server/marketing/storage";
import { editorData, versionRecipe } from "@/server/marketing/studio";
import { generateImageAction, saveArtAction } from "../studio-actions";

export const metadata: Metadata = { title: "Criar Artes" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Criar Artes (Etapa 2): editor com prévia desenhada pelo servidor. Abre em branco, a partir de uma
 * ideia do Estúdio IA (?geracao=&ideia=) ou para editar uma arte salva (?criativo=), gerando versão nova.
 */
export default async function ArtsPage({
  searchParams,
}: {
  searchParams: Promise<{ geracao?: string; ideia?: string; criativo?: string }>;
}) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canManage = can(roles, "marketing:manage");
  let initial: Partial<ArtSpec> & { name?: string } = {};
  let creativeId: string | null = null;
  let origin: string | null = null;

  if (sp.criativo && UUID.test(sp.criativo)) {
    const r = await versionRecipe(sp.criativo);
    if (r?.tipo === "arte") {
      initial = { ...(r.spec as Partial<ArtSpec>), name: r.name };
      creativeId = sp.criativo;
      origin = `Editando "${r.name}": salvar cria uma versão nova (a anterior fica guardada).`;
    }
  } else if (sp.geracao && UUID.test(sp.geracao)) {
    const g = await prisma.marketingGeneration.findFirst({ where: { id: sp.geracao } });
    const out = g?.output as unknown as StudioOutput | undefined;
    const idea = out?.artes[Number(sp.ideia) || 0];
    if (g && idea) {
      initial = {
        title: idea.titulo,
        subtitle: idea.subtitulo,
        cta: idea.chamada,
        highlight: idea.destaque,
        template: idea.destaque ? "oferta" : "destaque",
        brandId: g.brandId,
        name: idea.titulo.slice(0, 100),
      };
      origin = "Ideia do Estúdio IA aplicada. Confira os textos antes de salvar.";
    }
  }

  const data = await editorData();
  return (
    <>
      <AdminPageTitle
        title="Criar Artes"
        subtitle="Feed quadrado, feed vertical, Stories e Reels, com as cores, fontes e logomarca da marca."
      />
      {!canManage ? (
        <Card>
          <p>
            Seu perfil pode ver as artes na biblioteca, mas não criar. Peça acesso de Marketing ou Gestor.
          </p>
        </Card>
      ) : !storageReady() ? (
        <Card>
          <p className="font-semibold">O armazenamento de arquivos ainda não foi ligado neste ambiente.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Sem ele não dá para salvar as artes. Peça ao administrador para ligar o Cloudflare R2.
          </p>
        </Card>
      ) : (
        <Card>
          {origin ? (
            <p className="mb-4 rounded-lg bg-navy-50 px-3 py-2 text-sm font-semibold">{origin}</p>
          ) : null}
          <ArtEditor
            brands={data.brands}
            library={data.library}
            initial={initial}
            creativeId={creativeId}
            imageAi={data.imageAi}
            saveAction={saveArtAction}
            generateImage={generateImageAction}
          />
        </Card>
      )}
    </>
  );
}
