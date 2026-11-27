#!/usr/bin/env bash
# Build da PRÉVIA DE TESTE na Vercel (apps/web/vercel.json). Nunca usar em produção.
# 1) aplica as migrations no banco Neon (conexão direta); 2) cria o 1º superadministrador
# (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD) e as empresas DEMO, sem usuários de demonstração;
# 3) gera o site. Pode rodar a cada deploy: nada é duplicado nem apagado.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${APP_ENV:-homologacao}" = "production" ]; then
  echo "vercel-build.sh é só para a prévia de teste (APP_ENV=production recusado)." >&2
  exit 1
fi
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}"
DIRECT_URL="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"
if [ -z "$DIRECT_URL" ]; then
  echo "Banco não configurado: conecte um banco Neon ao projeto na aba Storage da Vercel." >&2
  exit 1
fi
if [ -z "${SEGREDO_MESTRE:-}" ] || [ "${#SEGREDO_MESTRE}" -lt 32 ]; then
  echo "Defina SEGREDO_MESTRE (32+ caracteres) nas variáveis de ambiente da Vercel." >&2
  exit 1
fi

DATABASE_URL="$DIRECT_URL" pnpm --filter @tmp/db exec prisma migrate deploy
DATABASE_URL="$DIRECT_URL" APP_ENV=homologacao pnpm --filter @tmp/db exec prisma db seed
DATABASE_URL="$DIRECT_URL" APP_ENV=homologacao pnpm --filter @tmp/db exec tsx prisma/seed-demo.ts --so-empresas
pnpm --filter @tmp/web build
