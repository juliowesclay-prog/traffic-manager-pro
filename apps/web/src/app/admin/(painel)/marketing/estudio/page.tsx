import type { Metadata } from "next";
import { requireCompanyStaff } from "@/server/auth";
import { ComingSoon } from "../coming-soon";

export const metadata: Metadata = { title: "Estúdio IA" };

export default async function StudioPage() {
  await requireCompanyStaff("marketing:read");
  return (
    <ComingSoon
      href="/admin/marketing/estudio"
      what={[
        "Conversa com a IA em português: \"Crie três ideias de anúncio para aumentar as assinaturas\".",
        "Escolha de marca, objetivo, público, formato, estilo, mensagem e chamada para ação.",
        "Duas ou três variações de cada criativo, prontas para teste.",
        "Usa só as informações oficiais APROVADAS no kit da marca; nunca inventa preço, benefício ou profissional.",
        "Na Etapa 7: sugestões a partir dos resultados reais das campanhas, sempre citando o período analisado.",
      ]}
      needs="chave da IA (Claude) no cofre do servidor e as informações oficiais aprovadas no kit da marca."
    />
  );
}
