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

## Módulo Marketing IA (por etapas; plano e custos aprovados à parte)
- **Etapa 1 — estrutura e biblioteca (27/11/2026, aguardando aprovação)**: item Marketing no menu e as 7 seções;
  biblioteca de criativos (imagem, carrossel de 2 a 10 imagens, vídeo) com versões, status, aprovação, duplicar,
  excluir e pesquisa; envio de arquivos conferidos pelo conteúdo (PNG, JPG, WEBP, MP4, MOV), privados e por empresa;
  kit da marca (identidade, logomarca, redes, chamadas, informações oficiais com aprovação).
  Armazenamento local nesta etapa; na Vercel o envio fica bloqueado até ligar o Cloudflare R2.
- Etapa 2 — artes com IA de imagens (depende do provedor de imagens e do R2).
- Etapa 3 — carrosséis (textos, páginas, prévia, ZIP).
- Etapa 4 — editor de vídeos (transcrição, cortes, legendas, FFmpeg em servidor fora da Vercel, fila no Postgres).
- Etapa 5 — Canva (opcional; preenchimento de modelos exige Canva Enterprise).
- Etapa 6 — enviar para a Meta (anúncio sempre criado pausado; depende do app real da Meta).
- Etapa 7 — inteligência de desempenho (métricas reais, com período citado).
