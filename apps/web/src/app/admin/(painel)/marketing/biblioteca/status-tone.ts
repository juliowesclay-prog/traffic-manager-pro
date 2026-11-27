import type { CreativeStatus } from "@tmp/core";

export const STATUS_TONE: Record<CreativeStatus, string> = {
  RASCUNHO: "bg-navy-50 text-ink-soft",
  EM_EDICAO: "bg-accent-50 text-accent-text",
  AGUARDANDO_APROVACAO: "bg-amber-50 text-amber-900",
  APROVADO: "bg-saving-50 text-saving-dark",
  ENVIADO_META: "bg-saving-50 text-saving-dark",
  ARQUIVADO: "bg-line text-ink-soft",
};
