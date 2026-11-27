# Traffic Manager Pro — arquitetura

Sistema de gestão de tráfego pago sincronizado com a Meta (Facebook/Instagram Ads). Nasceu do módulo
"Gestor de Tráfego IA" do Prosed+ Saúde (entregas 8.1 a 8.7) e agora roda sozinho.

Decisão de 27/11/2026: **uso interno agora, SaaS depois**. Por isso todos os dados já são separados por empresa.

## Peças

```
apps/web          Next.js 15: painel da equipe, API da fonte de vendas e rotina periódica
packages/core     regras puras com testes (tráfego, alertas, IA, ações, CAPI, fonte de vendas, perfis)
packages/db       Prisma + Postgres: schema, migrations, seed e seed DEMO; criptografia
packages/ui       componentes visuais
e2e/              testes de ponta a ponta (Playwright)
infra/            Postgres de desenvolvimento (docker compose)
```

## Login e perfis

- Equipe entra com e-mail + senha (Argon2id) **e** código do aplicativo autenticador (TOTP), sempre.
- Sessão no servidor (cookie com token aleatório; no banco só o hash), 12 h no máximo e 30 min sem uso.
- Perfis (`packages/core/src/rbac.ts`):

| Perfil | Pode |
|---|---|
| Superadministrador | Tudo, em todas as empresas; cadastra empresas, acessos e chaves da API |
| Gestor de tráfego | Ver, gerenciar e **aprovar** ações; auditoria (nas empresas liberadas) |
| Marketing | Ver e gerenciar (pedir ações), nas empresas liberadas |
| Leitura | Só ver, nas empresas liberadas |

## Separação por empresa (3 camadas)

1. **Empresa aberta na sessão** (`Session.activeCompanyId`), trocada pelo seletor do menu. Só aparecem as empresas liberadas para o usuário (`CompanyMember`); o superadministrador vê todas.
2. **Filtro automático** (`apps/web/src/server/db.ts`): toda leitura e gravação nas tabelas de empresa recebe o `companyId` da empresa aberta. As configurações do tráfego ganham o prefixo `<empresa>:`.
3. **Trava no banco**: o `companyId` não tem valor padrão válido; uma gravação que escapasse do filtro falha. As travas de negócio (uma conexão ativa, uma conta escolhida, uma ação aberta por item etc.) valem por empresa.

A rotina periódica (`/api/internal/tarefas`) e a API da fonte de vendas rodam explicitamente "dentro" de uma empresa (`runWithCompany`).

## Fonte de vendas

Substitui os associados e cobranças do Prosed. Os sistemas da empresa enviam cadastros (`Lead`), vendas e estornos (`Sale`) pela API: ver [API-FONTE-DE-VENDAS.md](API-FONTE-DE-VENDAS.md). Daí saem as abas Vendas por anúncio, Painel, Conversões e a IA analista.

## Integrações

- **Meta Graph API**: login (OAuth), contas, campanhas, resultados, ações com aprovação e API de Conversões. Em desenvolvimento, `META_PROVIDER=simulado` (contas DEMO).
- **Claude (Anthropic)**: IA analista, opcional. `AI_PROVIDER=simulado` por padrão; só números agregados são enviados.
