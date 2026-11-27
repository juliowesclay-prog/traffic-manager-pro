-- CreateEnum
CREATE TYPE "MetaLevel" AS ENUM ('CAMPANHA', 'CONJUNTO', 'ANUNCIO');

-- CreateEnum
CREATE TYPE "MetaSyncStatus" AS ENUM ('EXECUTANDO', 'OK', 'PARCIAL', 'ERRO');

-- CreateEnum
CREATE TYPE "MetaSyncTrigger" AS ENUM ('MANUAL', 'AUTOMATICA');

-- CreateTable
CREATE TABLE "meta_campaigns" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT NOT NULL,
    "effectiveStatus" TEXT NOT NULL,
    "dailyBudget" INTEGER,
    "lifetimeBudget" INTEGER,
    "budgetRemaining" INTEGER,
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "missingSince" TIMESTAMP(3),

    CONSTRAINT "meta_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ad_sets" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "campaignExternalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effectiveStatus" TEXT NOT NULL,
    "dailyBudget" INTEGER,
    "lifetimeBudget" INTEGER,
    "optimizationGoal" TEXT,
    "targetingSummary" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "missingSince" TIMESTAMP(3),

    CONSTRAINT "meta_ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ads" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "adSetExternalId" TEXT NOT NULL,
    "campaignExternalId" TEXT NOT NULL,
    "creativeExternalId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effectiveStatus" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "missingSince" TIMESTAMP(3),

    CONSTRAINT "meta_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_creatives" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "body" TEXT,
    "callToAction" TEXT,
    "objectType" TEXT,
    "thumbnailUrl" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_insights_daily" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "level" "MetaLevel" NOT NULL,
    "objectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "reach" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "linkClicks" INTEGER NOT NULL,
    "landingViews" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValue" INTEGER NOT NULL DEFAULT 0,
    "actions" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_insights_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_sync_runs" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "trigger" "MetaSyncTrigger" NOT NULL,
    "status" "MetaSyncStatus" NOT NULL DEFAULT 'EXECUTANDO',
    "since" DATE NOT NULL,
    "until" DATE NOT NULL,
    "counts" JSONB,
    "error" TEXT,
    "startedById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "meta_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_campaigns_accountId_externalId_key" ON "meta_campaigns"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_ad_sets_accountId_campaignExternalId_idx" ON "meta_ad_sets"("accountId", "campaignExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_sets_accountId_externalId_key" ON "meta_ad_sets"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_ads_accountId_adSetExternalId_idx" ON "meta_ads"("accountId", "adSetExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ads_accountId_externalId_key" ON "meta_ads"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_creatives_accountId_externalId_key" ON "meta_creatives"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_insights_daily_accountId_level_date_idx" ON "meta_insights_daily"("accountId", "level", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meta_insights_daily_accountId_level_objectId_date_key" ON "meta_insights_daily"("accountId", "level", "objectId", "date");

-- CreateIndex
CREATE INDEX "meta_sync_runs_accountId_startedAt_idx" ON "meta_sync_runs"("accountId", "startedAt");


-- Uma sincronização em execução por conta (evita duas ao mesmo tempo).
CREATE UNIQUE INDEX "meta_sync_runs_one_running" ON "meta_sync_runs"("accountId") WHERE "status" = 'EXECUTANDO';
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_non_negative" CHECK (
  "spend" >= 0 AND "impressions" >= 0 AND "reach" >= 0 AND "clicks" >= 0 AND "linkClicks" >= 0 AND "purchaseValue" >= 0
);
