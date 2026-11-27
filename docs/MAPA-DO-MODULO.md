# Mapa do módulo Gestor de Tráfego (origem: Prosed+ Saúde)

Cópia feita em 27/11/2026 a partir da pasta local do Prosed+ Saúde (versão com as entregas 8.1 a 8.7). Os caminhos foram mantidos iguais aos do Prosed para facilitar comparação.

## O que foi copiado

| Área | Caminho | Conteúdo |
|---|---|---|
| Telas do painel | `apps/web/src/app/admin/(painel)/trafego/` | Conexão com a Meta, Painel, Campanhas, Vendas, IA, Ações, Conversões |
| Retorno do login da Meta (OAuth) | `apps/web/src/app/api/v1/admin/trafego/meta/retorno/` | Recebe a autorização da Meta |
| Tela de autorização simulada | `apps/web/src/app/dev/meta-autorizar/` | Só desenvolvimento (modo simulado) |
| Servidor | `apps/web/src/server/traffic/` | Conexão, sincronização, relatórios, vendas, ações, API de Conversões, IA (Claude ou simulada), provedor simulado da Meta |
| Origem do cadastro (UTM e fbclid) | `apps/web/src/lib/attribution.ts` | Lê parâmetros dos anúncios no link de entrada |
| Gráfico diário | `apps/web/src/components/admin/daily-chart.tsx` | Usado no Painel |
| Regras de negócio | `packages/core/src/traffic*.ts` (+ `rbac`, `money`, `dates`) | Alertas, sincronização, IA, ações com teto, CAPI. **Roda sozinho, 43 testes** |
| Banco | `packages/db/prisma/schema-trafego.prisma` e `migrations/` | 22 modelos/enums e 6 migrations |
| Testes de ponta a ponta | `e2e/autenticacao-trafego*.spec.ts` | 7 arquivos, como referência |
| Telas de referência | `docs/telas/` | Capturas das entregas 8.4 a 8.7 |

## O que NÃO foi copiado (de propósito)

- `.env`, senhas, tokens, `ACESSOS-TESTE.local.txt`.
- Código do restante do Prosed (associados, parceiros, planos, pagamentos, carteirinha).

## Dependências do Prosed que precisam ser resolvidas na Fase 1

| Dependência | Onde é usada | Proposta |
|---|---|---|
| Login da equipe e permissões (`@/server/auth`, `requireStaff`, `traffic:read/manage/approve`) | Todas as telas e ações | Login próprio do Traffic Manager Pro (copiar o do Prosed, já testado: senha + 2 fatores) |
| Auditoria (`@/server/audit`) e limite de tentativas (`@/server/rate-limit`) | Conexão, ações, configurações | Copiar os dois módulos (pequenos) |
| Componentes visuais (`@prosed/ui`, `page-title`, `kpi-card`, formulários) | Todas as telas | Copiar e trocar a marca Prosed pela do Traffic Manager Pro |
| Banco e criptografia (`@prosed/db`: `prisma`, `encrypt`, `decrypt`) | Guardar o token da Meta cifrado, ler e gravar dados | Banco próprio (Postgres) com as 22 tabelas; copiar a criptografia |
| Configurações (`prisma.setting`) | Intervalo de sincronização, teto de gasto, CAPI | Tabela de configurações própria |
| Associados e cobranças (`prisma.member`, `subscriptionEvent`, `charge`, `memberAttribution`) | Abas **Vendas** e **Conversões** e parte do Painel (`server/traffic/sales.ts`, `conversions.ts`, `dashboard.ts`) | Ponto de maior acoplamento: trocar por uma "fonte de vendas" que recebe cadastros/vendas de qualquer sistema (Prosed e outros) por API |
| Tarefas automáticas (`/api/internal/tarefas`) | Sincronização automática e envio de conversões | Agendador próprio |
| Menu, rótulos de auditoria, LGPD (`nav-items`, `audit-labels`, `privacy.ts`) | Integração com o painel e exportação de dados | Recriar no novo painel |

## Dependências externas

- Meta Graph API (versão `META_GRAPH_VERSION`, padrão v24.0): login, contas, campanhas, insights, ações e API de Conversões.
- Claude (Anthropic) para a IA analista, opcional (`AI_PROVIDER=simulado` por padrão).
