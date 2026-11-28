import type { Metadata } from "next";
import { can, type CarouselSpec, type StudioOutput } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { CarouselEditor } from "@/components/marketing/art-editor";
import { requireCompanyStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { storageReady } from "@/server/marketing/storage";
import { editorData, versionRecipe } from "@/server/marketing/studio";
import { generateImageAction, saveCarouselAction } from "../studio-actions";

export const metadata: Metadata = { title: "Criar Carrossel" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Criar Carrossel (Etapa 3): páginas, prévia por página, PNG de cada página e ZIP na biblioteca. */
export default async function CarouselPage({
  searchParams,
}: {
  searchParams: Promise<{ geracao?: string; criativo?: string }>;
}) {
  const { roles } = await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const canManage = can(roles, "marketing:manage");
  let initial: Partial<CarouselSpec> & { name?: string } = {};
  let creativeId: string | null = null;
  let origin: string | null = null;

  if (sp.criativo && UUID.test(sp.criativo)) {
    const r = await versionRecipe(sp.criativo);
    if (r?.tipo === "carrossel") {
      initial = { ...(r.spec as Partial<CarouselSpec>), name: r.name };
      creativeId = sp.criativo;
      origin = `Editando "${r.name}": salvar cria uma versão nova (a anterior fica guardada).`;
    }
  } else if (sp.geracao && UUID.test(sp.geracao)) {
    const g = await prisma.marketingGeneration.findFirst({ where: { id: sp.geracao } });
    const out = g?.output as unknown as StudioOutput | undefined;
    if (g && out?.carrossel.paginas.length) {
      initial = {
        pages: out.carrossel.paginas.slice(0, 10).map((p) => ({ title: p.titulo, text: p.texto })),
        cta: out.carrossel.chamada,
        brandId: g.brandId,
        name: (out.carrossel.paginas[0]?.titulo ?? "Carrossel").slice(0, 100),
      };
      origin = "Carrossel do Estúdio IA aplicado. Confira os textos antes de salvar.";
    }
  }

  const data = await editorData();
  return (
    <>
      <AdminPageTitle
        title="Criar Carrossel"
        subtitle="De 2 a 10 páginas: capa chamativa, conteúdo e chamada final."
      />
      {!canManage ? (
        <Card>
          <p>
            Seu perfil pode ver os carrosséis na biblioteca, mas não criar. Peça acesso de Marketing ou
            Gestor.
          </p>
        </Card>
      ) : !storageReady() ? (
        <Card>
          <p className="font-semibold">O armazenamento de arquivos ainda não foi ligado neste ambiente.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Sem ele não dá para salvar os carrosséis. Peça ao administrador para ligar o Cloudflare R2.
          </p>
        </Card>
      ) : (
        <Card>
          {origin ? (
            <p className="mb-4 rounded-lg bg-navy-50 px-3 py-2 text-sm font-semibold">{origin}</p>
          ) : null}
          <CarouselEditor
            brands={data.brands}
            library={data.library}
            initial={initial}
            creativeId={creativeId}
            imageAi={data.imageAi}
            saveAction={saveCarouselAction}
            generateImage={generateImageAction}
          />
        </Card>
      )}
    </>
  );
}
