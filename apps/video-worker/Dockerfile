# Servidor de vídeo do Traffic Manager Pro (Etapa 4). Construir a partir da RAIZ do repositório:
#   docker build -f apps/video-worker/Dockerfile -t tmp-video-worker .
# Variáveis: APP_URL (endereço do site), VIDEO_WORKER_SECRET (mesmo valor do site, 32+ letras),
# VIDEO_WORKER_NAME (opcional). Não precisa de porta aberta: ele só faz pedidos ao site.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/video-worker/package.json apps/video-worker/
RUN pnpm install --frozen-lockfile --filter @tmp/video-worker...
COPY packages/core packages/core
COPY apps/video-worker apps/video-worker
COPY assets/fonts assets/fonts
ENV FONTS_DIR=/app/assets/fonts NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@tmp/video-worker", "start"]
