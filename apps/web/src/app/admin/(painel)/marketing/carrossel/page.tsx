import type { Metadata } from "next";
import { requireCompanyStaff } from "@/server/auth";
import { ComingSoon } from "../coming-soon";

export const metadata: Metadata = { title: "Criar Carrossel" };

export default async function CarouselPage() {
  await requireCompanyStaff("marketing:read");
  return (
    <ComingSoon
      href="/admin/marketing/carrossel"
      what={[
        "Você informa o tema e o número de páginas; a IA cria a abertura, o conteúdo e a chamada final.",
        "Edição página por página, com a identidade visual da marca.",
        "Download de cada página ou de todas em ZIP, prontas para anúncio de carrossel na Meta.",
      ]}
      needs="Etapa 2 (criação de artes). Hoje você já pode importar um carrossel pronto (2 a 10 imagens) na biblioteca."
    />
  );
}
