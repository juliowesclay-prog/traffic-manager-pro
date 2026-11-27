# Traffic Manager Pro

Gestão de tráfego pago sincronizada com a Meta (Facebook e Instagram Ads): conexão com a conta de
anúncios, painel, campanhas, vendas por anúncio (CAC e retorno), IA analista, ações com aprovação e
API de Conversões. Os dados de cada empresa ficam separados.

- Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md) · Fases: [docs/ROADMAP.md](docs/ROADMAP.md)
- API da fonte de vendas: [docs/API-FONTE-DE-VENDAS.md](docs/API-FONTE-DE-VENDAS.md)
- Segurança e LGPD: [docs/SEGURANCA.md](docs/SEGURANCA.md) · Origem no Prosed+ Saúde: [docs/MAPA-DO-MODULO.md](docs/MAPA-DO-MODULO.md)

## Instalação (desenvolvimento)

Pré-requisitos: Node 22 (corepack/pnpm 9) e Docker.

```bash
corepack enable
pnpm install
pnpm env:init        # cria o .env com senhas e chaves aleatórias
pnpm infra:up        # Postgres na porta 5436
pnpm db:deploy       # aplica as migrations
pnpm db:seed         # cria o 1º superadministrador (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
pnpm db:seed:demo    # opcional: empresas e usuários DEMO (@trafficmanager.test)
pnpm dev             # painel em http://localhost:3300/admin/entrar
pnpm demo:acesso     # mostra no SEU terminal a senha e o código dos usuários DEMO
pnpm worker          # opcional: rotina de sincronização e conversões a cada 30 s
```

Em desenvolvimento a Meta e a IA são **simuladas** (`META_PROVIDER=simulado`, `AI_PROVIDER=simulado`).

## Qualidade

| Comando | O que faz |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint e TypeScript estrito |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:e2e` | Ponta a ponta (Playwright), contra o banco de desenvolvimento com dados DEMO |

Para testar no build de produção: `pnpm --filter @tmp/web build:local-prod`, suba com `next start --port 3301`
(pasta `.next-prod`) e rode `E2E_BASE_URL=http://localhost:3301 APP_URL=http://localhost:3301 pnpm test:e2e --retries=0`.

## Regras do projeto

- Valores em centavos inteiros. Segredos só no `.env` ou no cofre (nunca versionados).
- Dados de demonstração sempre marcados `DEMO`.
- Nenhuma cobrança, publicação ou alteração em produção sem autorização expressa.
