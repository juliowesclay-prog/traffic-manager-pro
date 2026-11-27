# Traffic Manager Pro — instruções para o Claude

Sistema isolado de tráfego pago sincronizado com a Meta, extraído do Gestor de Tráfego do Prosed+ Saúde.
**Nunca alterar o Prosed+ Saúde** (fica no Mac do usuário, em produção). Não misturar código, banco nem portas.

## Regras de trabalho

- Responder sempre em português do Brasil, de forma breve e empresarial (o usuário é o CEO, não programador).
- Entregas pequenas (`docs/ROADMAP.md`); ao fechar cada uma: testes rodados, o que foi feito/testado/pendente e pedido de aprovação.
- Nunca fazer cobrança real, publicar, apontar domínio ou ligar a Meta real sem autorização expressa.
- Segredos só no `.env` ou no cofre; nunca pedir nem repetir em chat. Dados de demonstração sempre `DEMO`.

## Técnico

- pnpm 9 + turbo; Next.js 15 (`apps/web`, porta 3300; build de produção local em 3301 com `.next-prod`); Prisma 6 + Postgres (porta 5436).
- Pacotes: `@tmp/core`, `@tmp/db`, `@tmp/ui`, `@tmp/web`.
- Dados por empresa: use sempre o `prisma` de `@/server/db` (filtro automático por empresa). O `prisma` de `@tmp/db` é sem filtro: só para tabelas globais (usuários, sessões, empresas) e rotinas que chamam `runWithCompany`.
- Telas de tráfego usam `requireCompanyStaff(permissão)`; telas globais, `requireStaff`.
- Travas que o Prisma não expressa (índices parciais, CHECK) ficam em migrations SQL escritas à mão (`20261127010000_travas`). Ao gerar migration nova com `prisma migrate diff`, conferir que elas não somem.
- Testes de ponta a ponta: `pnpm test:e2e` (usa os usuários DEMO de `pnpm db:seed:demo`, empresas com IDs fixos).
