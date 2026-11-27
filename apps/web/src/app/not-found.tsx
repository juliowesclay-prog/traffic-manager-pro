import { Home } from "lucide-react";
import { Container } from "@tmp/ui";
import { LinkButton } from "@/components/link-button";

export default function NotFound() {
  return (
    <main id="conteudo">
      <Container className="py-20">
        <h1 className="font-display text-4xl font-extrabold text-navy">Página não encontrada</h1>
        <p className="mt-4 text-xl text-ink-soft">O endereço pode estar errado ou a página mudou de lugar.</p>
        <LinkButton href="/admin" variant="primary" size="lg" className="mt-8" icon={<Home className="size-7" />}>
          Voltar para o painel
        </LinkButton>
      </Container>
    </main>
  );
}
