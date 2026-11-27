/** Seções do módulo Marketing, na ordem do menu. `stage` = etapa em que a seção passa a funcionar. */
export const MARKETING_SECTIONS = [
  {
    href: "/admin/marketing/estudio",
    label: "Estúdio IA",
    icon: "MessagesSquare",
    stage: 2,
    summary: "Converse com a IA para criar anúncios, roteiros e variações usando o kit da marca.",
  },
  {
    href: "/admin/marketing/artes",
    label: "Criar Artes",
    icon: "Image",
    stage: 2,
    summary: "Gere artes de feed, Stories e Reels com logomarca, cores e chamada para ação.",
  },
  {
    href: "/admin/marketing/carrossel",
    label: "Criar Carrossel",
    icon: "GalleryHorizontal",
    stage: 3,
    summary: "Monte carrosséis página por página, com abertura chamativa e chamada final.",
  },
  {
    href: "/admin/marketing/videos",
    label: "Editor de Vídeos IA",
    icon: "Clapperboard",
    stage: 4,
    summary: "Envie um vídeo real e receba versões cortadas, com legendas e logomarca, em MP4.",
  },
  {
    href: "/admin/marketing/biblioteca",
    label: "Biblioteca de Criativos",
    icon: "Library",
    stage: 1,
    summary: "Guarde imagens, carrosséis e vídeos com versões, status e aprovação.",
  },
  {
    href: "/admin/marketing/enviar-meta",
    label: "Enviar para Meta",
    icon: "Send",
    stage: 6,
    summary: "Envie criativos aprovados para uma campanha existente, sempre como anúncio pausado.",
  },
  {
    href: "/admin/marketing/marca",
    label: "Kit da marca",
    icon: "Palette",
    stage: 1,
    summary: "Logomarca, cores, fontes, redes e as informações oficiais que a IA pode usar.",
  },
] as const;

/** Etapa do módulo já entregue (as seções de etapas seguintes mostram o que vem e quando). */
export const MARKETING_STAGE_DONE = 1;
