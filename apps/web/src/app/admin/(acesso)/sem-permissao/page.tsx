import type { Metadata } from "next";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Sem permissão" };

export default function NoPermissionPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl font-semibold text-ink">Você não tem acesso a esta área</h1>
      <p className="mt-3 text-lg text-ink-soft">
        Se precisar, peça a um superadministrador para ajustar seu perfil.
      </p>
      <LinkButton href="/admin" variant="primary" className="mt-8">
        Voltar ao painel
      </LinkButton>
    </div>
  );
}
