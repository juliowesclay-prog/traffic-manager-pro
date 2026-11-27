-- CreateEnum
CREATE TYPE "VideoJobKind" AS ENUM ('TRANSCREVER', 'EDITAR');

-- CreateEnum
CREATE TYPE "VideoJobStatus" AS ENUM ('NA_FILA', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetaAdSubmissionStatus" AS ENUM ('ENVIANDO', 'ENVIADO', 'FALHOU');

-- AlterTable
ALTER TABLE "creative_versions" ADD COLUMN     "spec" JSONB;

-- AlterTable
ALTER TABLE "creatives" ADD COLUMN     "metaAdIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "marketing_generations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "brandId" UUID,
    "parentId" UUID,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_jobs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "kind" "VideoJobKind" NOT NULL,
    "creativeId" UUID NOT NULL,
    "sourceAssetId" UUID NOT NULL,
    "spec" JSONB NOT NULL,
    "status" "VideoJobStatus" NOT NULL DEFAULT 'NA_FILA',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "error" TEXT,
    "result" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canva_connections" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "userId" UUID NOT NULL,
    "accessEnc" TEXT NOT NULL,
    "refreshEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canva_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canva_oauth_states" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "stateHash" TEXT NOT NULL,
    "verifierEnc" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canva_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ad_submissions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "creativeId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "instagramId" TEXT,
    "adName" TEXT NOT NULL,
    "primaryText" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT,
    "link" TEXT NOT NULL,
    "callToAction" TEXT NOT NULL,
    "metaImageHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metaVideoId" TEXT,
    "metaCreativeId" TEXT,
    "metaAdId" TEXT,
    "status" "MetaAdSubmissionStatus" NOT NULL DEFAULT 'ENVIANDO',
    "error" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "meta_ad_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_generations_companyId_createdAt_idx" ON "marketing_generations"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "video_jobs_status_createdAt_idx" ON "video_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "video_jobs_companyId_creativeId_idx" ON "video_jobs"("companyId", "creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "canva_connections_companyId_userId_key" ON "canva_connections"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "canva_oauth_states_stateHash_key" ON "canva_oauth_states"("stateHash");

-- CreateIndex
CREATE INDEX "canva_oauth_states_userId_createdAt_idx" ON "canva_oauth_states"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "meta_ad_submissions_companyId_creativeId_idx" ON "meta_ad_submissions"("companyId", "creativeId");

-- AddForeignKey
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ad_submissions" ADD CONSTRAINT "meta_ad_submissions_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─── Travas escritas à mão (o Prisma não expressa) ─────────────────
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_purpose_ok";
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_purpose_ok" CHECK ("purpose" IN ('criativo', 'logo', 'fundo'));
ALTER TABLE "marketing_generations" ADD CONSTRAINT "marketing_generations_tokens_ok"
  CHECK (("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0));
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_progress_ok" CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_attempts_ok" CHECK ("attempts" BETWEEN 0 AND 10);
-- Tarefa em processamento sempre tem dono e prazo; concluída/falhada tem data de fim.
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_lock_ok"
  CHECK ("status" <> 'PROCESSANDO' OR ("lockedBy" IS NOT NULL AND "leaseUntil" IS NOT NULL));
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_finished_ok"
  CHECK ("status" NOT IN ('CONCLUIDO', 'FALHOU') OR "finishedAt" IS NOT NULL);
-- Um envio para a Meta por vez para cada criativo (evita anúncio duplicado com clique duplo).
CREATE UNIQUE INDEX "meta_ad_submissions_one_running" ON "meta_ad_submissions" ("creativeId") WHERE "status" = 'ENVIANDO';
-- Enviado = a Meta devolveu o anúncio criado.
ALTER TABLE "meta_ad_submissions" ADD CONSTRAINT "meta_ad_submissions_sent_ok"
  CHECK ("status" <> 'ENVIADO' OR ("metaAdId" IS NOT NULL AND "metaCreativeId" IS NOT NULL AND "finishedAt" IS NOT NULL));
