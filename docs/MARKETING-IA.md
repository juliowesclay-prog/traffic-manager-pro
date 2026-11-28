# Marketing IA — como funciona, o que configurar e quanto custa

Módulo Marketing do Traffic Manager Pro (Etapas 1 a 7). Tudo funciona em modo **simulado (DEMO)** sem
nenhuma conta paga; cada serviço real é ligado só com autorização do Júlio, colocando as chaves no `.env`
(local) ou nas variáveis da Vercel/servidor. Nenhuma chave vai para o navegador.

## O que cada seção faz

| Seção | O que faz | Serviço real (quando ligado) |
| --- | --- | --- |
| Estúdio IA | Títulos, textos, chamadas, ideias de arte, carrossel e roteiro de vídeo, só com informações **aprovadas** do kit da marca. Aponta riscos de política da Meta e preços não aprovados. | Claude (`MARKETING_AI_PROVIDER=claude`, `ANTHROPIC_API_KEY`) |
| Criar Artes | PNG desenhado no servidor (4 modelos × feed, retrato, Stories), logomarca, cores e fontes da marca. Foto de fundo enviada, da biblioteca ou por IA. | Foto por IA: OpenAI gpt-image-1 (`IMAGE_PROVIDER=openai`, `OPENAI_API_KEY`) |
| Criar Carrossel | 2 a 10 páginas, capa, páginas numeradas e chamada final; baixa tudo em ZIP. | — |
| Editor de Vídeos | Cortes, remoção de silêncios, 9:16 / 4:5 / 1:1 / 16:9, legendas, logomarca e encerramento. Cada edição vira criativo novo; o original não muda. | Servidor de vídeo com FFmpeg (abaixo). Transcrição: Whisper (`TRANSCRIBE_PROVIDER=openai`) |
| Biblioteca | Versões, status, aprovação (só Gestor/Superadmin), ZIP, editar de novo. | Arquivos no Cloudflare R2 (`STORAGE_DRIVER=r2`) |
| Canva | Cada pessoa conecta a própria conta e importa designs (PNG, carrossel ou MP4). Só lê; nada muda no Canva. | App do Canva (`CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`) |
| Enviar para Meta | Criativo **aprovado** vira anúncio **PAUSADO** num conjunto existente. Nunca ativa, não mexe em orçamento nem em anúncio existente. Histórico com o código da Meta ou o motivo da recusa. | App real da Meta com `ads_management` |
| Desempenho | Por criativo (soma dos anúncios ligados) e por tipo: investido, impressões, CTR, CPC, cadastros, vendas reais, custo por venda e receita, sempre com o período. | Dados já sincronizados no Gestor de Tráfego |

## Configuração (variáveis)

Veja `.env.example`. Resumo do que falta ligar em produção:

1. **Cloudflare R2** (obrigatório na Vercel): `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. No bucket, liberar CORS para o endereço do site:
   ```json
   [{ "AllowedOrigins": ["https://SEU-DOMINIO"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
   O bucket fica **privado**; o sistema gera links temporários.
2. **Claude** (textos do Estúdio): `MARKETING_AI_PROVIDER=claude`, `ANTHROPIC_API_KEY`. Modelo padrão `claude-sonnet-5-5`.
3. **OpenAI** (fotos e transcrição): `IMAGE_PROVIDER=openai`, `TRANSCRIBE_PROVIDER=openai`, `OPENAI_API_KEY`.
4. **Servidor de vídeo**: `VIDEO_WORKER_SECRET` igual no site e no servidor (32+ letras aleatórias).
   Imagem pronta: `docker build -f apps/video-worker/Dockerfile -t tmp-video-worker .` e rodar com
   `APP_URL` e `VIDEO_WORKER_SECRET`. Serve Railway, Fly.io ou uma VPS (2 vCPU, 4 GB). Não abre porta:
   ele busca as tarefas no site. A tela de vídeos mostra se ele está ligado.
5. **Canva**: criar a integração em canva.com/developers (Connect API), escopos `design:meta:read` e
   `design:content:read`, endereço de retorno `APP_URL/api/v1/admin/marketing/canva/retorno`
   (no computador local o Canva exige `127.0.0.1`, não `localhost`). Colocar `CANVA_CLIENT_ID` e `CANVA_CLIENT_SECRET`.
6. **Meta real**: o mesmo app do Gestor de Tráfego, com a permissão `ads_management` aprovada pela Meta
   (Fase 2). Sem ela, a tela de envio avisa e não envia.

## Custos estimados (uso interno, MVP)

| Item | Estimativa mensal |
| --- | --- |
| Cloudflare R2 (até ~50 GB, sem taxa de saída) | US$ 0 a 1 |
| Claude Sonnet (Estúdio, ~300 pedidos) | US$ 5 a 15 |
| OpenAI gpt-image-1 (~100 fotos) e Whisper (~5 h de áudio) | US$ 5 a 20 |
| Servidor de vídeo (Railway/Fly/VPS pequena) | US$ 5 a 25 |
| Canva Connect API | sem custo de API (cada pessoa usa a conta que já tem) |
| **Total** | **≈ US$ 15 a 60** (dentro da faixa aprovada de US$ 35 a 135) |

## Travas de segurança

- Anúncio sempre `PAUSED`; o status "Enviado para Meta" só é marcado pelo envio real, nunca à mão.
- Um envio por vez por criativo (índice no banco); falhas ficam no histórico com a etapa que falhou.
- IA só usa informações aprovadas; preço citado que não está aprovado vira alerta.
- Chaves do Canva e da Meta cifradas no banco; "state" + PKCE de uso único no login do Canva.
- Servidor de vídeo autenticado por segredo (comparação em tempo constante) e só enxerga a tarefa que pegou.
- Dados separados por empresa em todas as tabelas novas.
