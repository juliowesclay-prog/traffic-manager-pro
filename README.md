# Traffic Manager Pro

Sistema de gestão de tráfego pago sincronizado com a Meta (Facebook e Instagram Ads): conecta a conta de anúncios, sincroniza campanhas, conjuntos, anúncios e resultados diários, mostra painel e alertas, cruza com vendas, tem IA analista, pede ações nos anúncios com aprovação e envia conversões pela API de Conversões da Meta.

## Situação: Fase 0 (cópia do módulo)

Este repositório nasceu como **cópia fiel** da seção "Gestor de Tráfego IA" do Prosed+ Saúde (entregas 8.1 a 8.7, versão de 26/11/2026). O Prosed+ Saúde **não foi alterado**.

| Parte | Situação |
|---|---|
| Regras de negócio (`packages/core`) | Roda sozinha: 43 testes passando e verificação de tipos ok |
| Telas, servidor e integração Meta (`apps/web`) | Copiado, **ainda não roda sozinho**: depende de login, auditoria, componentes visuais e banco do Prosed |
| Banco (`packages/db`) | Modelo das 22 tabelas/enums do tráfego e as 6 migrations originais |
| Testes de ponta a ponta (`e2e`) | Copiados como referência; voltam a rodar na Fase 1 |

O mapa completo de arquivos e dependências está em [`docs/MAPA-DO-MODULO.md`](docs/MAPA-DO-MODULO.md).

## Comandos

```bash
pnpm install
pnpm test        # testes das regras de negócio
pnpm typecheck
```

## Segurança

Nenhum segredo, token ou `.env` foi copiado. Use `.env.example` como modelo.
