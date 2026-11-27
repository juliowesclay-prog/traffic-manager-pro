# Traffic Manager Pro — fases

## Fase 0 — cópia fiel (concluída em 27/11/2026)
Cópia do módulo Gestor de Tráfego do Prosed+ Saúde, sem alterar o original.

## Fase 1 — funcionar sozinho (concluída em 27/11/2026, aguardando aprovação)
- Login próprio da equipe (senha + autenticador), perfis Superadministrador, Gestor de tráfego, Marketing e Leitura.
- Banco próprio, com todos os dados separados por empresa (filtro automático + travas no banco).
- Cadastro de empresas, acesso por empresa, seletor da empresa aberta, suspender/reativar.
- Fonte de vendas por API com chave por empresa (cadastro, venda, estorno; sem duplicar; sem dados pessoais).
- Gestor de Tráfego (conexão Meta, painel, campanhas, vendas por anúncio, IA, ações com aprovação, conversões) ligado à fonte de vendas.
- Critério de conclusão: testes unitários, tipos, lint, build de produção e 35 testes de ponta a ponta passando.

## Próximas fases (propostas, dependem de aprovação)
- **Fase 2 — colocar no ar para uso interno**: hospedagem (VPS em São Paulo com Docker e Caddy), domínio, cofre de segredos, app real da Meta (análise do app pela Meta), agendador da rotina, backup do banco.
- **Fase 3 — ligar o Prosed+ Saúde como fonte de vendas**: o Prosed envia cadastros e vendas pela API (alteração no Prosed só com autorização).
- **Fase 4 — SaaS**: cadastro de clientes, planos e cobrança, painel por cliente, termos de uso.
