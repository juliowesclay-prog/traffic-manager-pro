import type { Metadata } from "next";
import { requireCompanyStaff } from "@/server/auth";
import { ComingSoon } from "../coming-soon";

export const metadata: Metadata = { title: "Criar Artes" };

export default async function ArtsPage() {
  await requireCompanyStaff("marketing:read");
  return (
    <ComingSoon
      href="/admin/marketing/artes"
      what={[
        "Artes em feed quadrado (1:1), feed vertical (4:5), Stories e Reels (9:16).",
        "Imagem gerada por IA com uso comercial permitido, mais título, texto, logomarca, cores e chamada para ação.",
        "Variações, prévia, pedidos de alteração por texto e exportação em PNG ou JPG.",
        "Cada arte gerada entra na biblioteca como rascunho, com versões.",
      ]}
      needs="contratação do provedor de imagens (aprovação do orçamento) e armazenamento Cloudflare R2."
    />
  );
}
