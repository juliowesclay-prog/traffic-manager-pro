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
- **Etapa 1 — estrutura e biblioteca (27/11/2026, aprovada e na main)**: item Marketing no menu e as 7 seções;
  biblioteca de criativos (imagem, carrossel de 2 a 10 imagens, vídeo) com versões, status, aprovação, duplicar,
  excluir e pesquisa; envio de arquivos conferidos pelo conteúdo (PNG, JPG, WEBP, MP4, MOV), privados e por empresa;
  kit da marca (identidade, logomarca, redes, chamadas, informações oficiais com aprovação).
  Armazenamento local nesta etapa; na Vercel o envio fica bloqueado até ligar o Cloudflare R2.
- **Etapas 2 a 7 (27/11/2026, aguardando aprovação do merge)** — detalhes, configuração e custos em `docs/MARKETING-IA.md`:
  - Etapa 2: Estúdio IA (Claude, só com informações aprovadas da marca) e Criar Artes (PNG desenhado no servidor, 4 modelos, 3 formatos, foto por IA opcional).
  - Etapa 3: Criar Carrossel (2 a 10 páginas, capa e chamada final, ZIP).
  - Etapa 4: Editor de Vídeos (fila no Postgres + servidor FFmpeg fora da Vercel: cortes, silêncios, 4 formatos, legendas, logomarca, encerramento; transcrição Whisper).
  - Etapa 5: Canva (cada pessoa conecta a própria conta; importa PNG, carrossel ou MP4).
  - Etapa 6: Enviar para Meta (anúncio SEMPRE pausado, num conjunto existente, com alerta de política e histórico).
  - Etapa 7: Desempenho (por criativo e por tipo, com vendas reais e período citado).
  - Pendente de contratação/autorização: Cloudflare R2, chave da OpenAI, chave da Anthropic, servidor de vídeo, app do Canva e app real da Meta com ads_management.

## IA do próprio cliente (28/11/2026, aguardando aprovação do merge)
- Configuração › Inteligência artificial: cada empresa cadastra a chave de API do Claude ou do ChatGPT (passo a passo
  na tela, teste antes de salvar, chave cifrada, só os 4 últimos caracteres visíveis, auditoria). Tem prioridade sobre a
  IA da plataforma; removendo, volta para a da plataforma. Só Gestor e Superadmin alteram. Usada na IA analista.
- Login e senha do ChatGPT/Claude não são usados: os serviços não permitem e a assinatura comum não dá acesso por API.
