# Mapa do módulo Gestor de Tráfego (origem: Prosed+ Saúde)

Fase 0: cópia feita em 27/11/2026 a partir da pasta local do Prosed+ Saúde (versão com as entregas 8.1 a 8.7). Os caminhos foram mantidos iguais aos do Prosed para facilitar comparação.

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
| Banco | `packages/db/prisma/schema.prisma` | 22 modelos/enums (as 6 migrations do Prosed viraram uma só na Fase 1) |
| Testes de ponta a ponta | `e2e/autenticacao-trafego*.spec.ts` | 7 arquivos, como referência |

## O que NÃO foi copiado (de propósito)

- `.env`, senhas, tokens, `ACESSOS-TESTE.local.txt`.
- Código do restante do Prosed (associados, parceiros, planos, pagamentos, carteirinha).

## Dependências do Prosed — resolvidas na Fase 1 (27/11/2026)

| Dependência no Prosed | Como ficou no Traffic Manager Pro |
|---|---|
| Login da equipe e permissões | Login próprio (senha + autenticador) e perfis próprios: Superadministrador, Gestor de tráfego, Marketing, Leitura |
| Auditoria e limite de tentativas | Copiados; a auditoria agora registra a empresa |
| Componentes visuais e marca | Copiados, com a marca Traffic Manager Pro |
| Banco e criptografia | Banco próprio (migration única `20261127000000_inicial` + travas `20261127010000_travas`), dados separados por empresa |
| Configurações (`setting`) | Por empresa (prefixo `<empresa>:traffic.*`) |
| Associados e cobranças (`member`, `memberAttribution`, `charge`…) | Substituídos pela **fonte de vendas**: `Lead` e `Sale`, recebidos pela API `POST /api/v1/eventos` ([API-FONTE-DE-VENDAS.md](API-FONTE-DE-VENDAS.md)) |
| Tarefas automáticas | Mesma rota, agora rodando para cada empresa ativa (`pnpm worker` em desenvolvimento) |
| Menu, rótulos de auditoria, LGPD | Menu novo (Gestor de Tráfego, Fonte de vendas, Empresas, Equipe, Auditoria). A exportação de dados do titular fica com o sistema de origem, que é quem tem os dados pessoais |

O que saiu de vez: site público, área do associado, portal do parceiro, planos, pagamentos, carteirinha, e-mails e SMS.

## Dependências externas

- Meta Graph API (versão `META_GRAPH_VERSION`, padrão v24.0): login, contas, campanhas, insights, ações e API de Conversões.
- Claude (Anthropic) para a IA analista, opcional (`AI_PROVIDER=simulado` por padrão).
