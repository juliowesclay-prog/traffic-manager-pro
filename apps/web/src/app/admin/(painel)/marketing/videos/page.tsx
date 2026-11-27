import type { Metadata } from "next";
import { requireCompanyStaff } from "@/server/auth";
import { ComingSoon } from "../coming-soon";

export const metadata: Metadata = { title: "Editor de Vídeos IA" };

export default async function VideosPage() {
  await requireCompanyStaff("marketing:read");
  return (
    <ComingSoon
      href="/admin/marketing/videos"
      what={[
        "Você envia um vídeo real (MP4 ou MOV); a IA transcreve, encontra os melhores trechos e monta o plano de cortes.",
        "Cortes de silêncio, legendas sincronizadas, logomarca, título, chamada para ação, formato 9:16 e volume ajustado.",
        "Versões de 15, 30, 45 ou 60 segundos, sem cortar falas de forma que mude o sentido.",
        "Pedidos por texto (\"coloque legendas grandes\") geram uma nova versão; as anteriores ficam guardadas.",
        "Renderização de verdade com FFmpeg, em fila, com os estados Enviado → Analisando → Editando → Renderizando → Concluído.",
      ]}
      needs="servidor de vídeo com FFmpeg fora da Vercel, serviço de transcrição e armazenamento R2. Hoje você já pode guardar vídeos na biblioteca (até 500 MB e 10 minutos)."
    />
  );
}
