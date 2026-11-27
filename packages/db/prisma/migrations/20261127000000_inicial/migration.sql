-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'GESTOR', 'MARKETING', 'LEITURA');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ATIVA', 'SUSPENSA');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PAGA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('ATIVA', 'DESCONECTADA');

-- CreateEnum
CREATE TYPE "MetaLevel" AS ENUM ('CAMPANHA', 'CONJUNTO', 'ANUNCIO');

-- CreateEnum
CREATE TYPE "MetaSyncStatus" AS ENUM ('EXECUTANDO', 'OK', 'PARCIAL', 'ERRO');

-- CreateEnum
CREATE TYPE "MetaSyncTrigger" AS ENUM ('MANUAL', 'AUTOMATICA');

-- CreateEnum
CREATE TYPE "TrafficAnalysisStatus" AS ENUM ('EXECUTANDO', 'OK', 'ERRO');

-- CreateEnum
CREATE TYPE "TrafficActionKind" AS ENUM ('PAUSAR', 'REATIVAR', 'ORCAMENTO');

-- CreateEnum
CREATE TYPE "TrafficActionStatus" AS ENUM ('PENDENTE', 'EXECUTANDO', 'EXECUTADA', 'RECUSADA', 'CANCELADA', 'EXPIRADA', 'FALHOU');

-- CreateEnum
CREATE TYPE "ConversionKind" AS ENUM ('CADASTRO', 'VENDA');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'ERRO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" TEXT,
    "companyId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaSecretEnc" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "mfaLastStep" INTEGER,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "activeCompanyId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ATIVA',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "content" TEXT,
    "campaignExternalId" TEXT,
    "adSetExternalId" TEXT,
    "adExternalId" TEXT,
    "fbclid" TEXT,
    "landingUrl" TEXT,
    "clickedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "externalId" TEXT NOT NULL,
    "leadId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "first" BOOLEAN NOT NULL DEFAULT true,
    "status" "SaleStatus" NOT NULL DEFAULT 'PAGA',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "provider" TEXT NOT NULL,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'ATIVA',
    "metaUserId" TEXT NOT NULL,
    "metaUserName" TEXT NOT NULL,
    "tokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "connectedById" UUID NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "disconnectedById" UUID,

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ad_accounts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "connectionId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "accountStatus" INTEGER NOT NULL,
    "businessName" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "selectedById" UUID,
    "selectedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_oauth_states" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "stateHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_campaigns" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
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
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
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
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
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
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
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
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
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
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
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

-- CreateTable
CREATE TABLE "traffic_analyses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "accountId" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "TrafficAnalysisStatus" NOT NULL DEFAULT 'EXECUTANDO',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "traffic_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_actions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "accountId" TEXT NOT NULL,
    "level" "MetaLevel" NOT NULL,
    "objectId" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "kind" "TrafficActionKind" NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "fromBudget" INTEGER,
    "toBudget" INTEGER,
    "increasesSpend" BOOLEAN NOT NULL,
    "totalBefore" INTEGER NOT NULL,
    "totalAfter" INTEGER NOT NULL,
    "capCents" INTEGER,
    "reason" TEXT NOT NULL,
    "analysisId" UUID,
    "status" "TrafficActionStatus" NOT NULL,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "executedAt" TIMESTAMP(3),
    "error" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "traffic_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_conversion_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "eventId" TEXT NOT NULL,
    "kind" "ConversionKind" NOT NULL,
    "leadId" UUID NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "valueCents" INTEGER,
    "campaignExternalId" TEXT,
    "status" "ConversionStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_at_idx" ON "audit_logs"("companyId", "at");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "company_members_userId_idx" ON "company_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_companyId_idx" ON "api_keys"("companyId");

-- CreateIndex
CREATE INDEX "leads_companyId_createdAt_idx" ON "leads"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_campaignExternalId_idx" ON "leads"("campaignExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_companyId_externalId_key" ON "leads"("companyId", "externalId");

-- CreateIndex
CREATE INDEX "sales_companyId_paidAt_idx" ON "sales"("companyId", "paidAt");

-- CreateIndex
CREATE INDEX "sales_leadId_idx" ON "sales"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_externalId_key" ON "sales"("companyId", "externalId");

-- CreateIndex
CREATE INDEX "meta_connections_status_idx" ON "meta_connections"("status");

-- CreateIndex
CREATE INDEX "meta_connections_companyId_idx" ON "meta_connections"("companyId");

-- CreateIndex
CREATE INDEX "meta_ad_accounts_companyId_idx" ON "meta_ad_accounts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_accounts_connectionId_accountId_key" ON "meta_ad_accounts"("connectionId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_oauth_states_stateHash_key" ON "meta_oauth_states"("stateHash");

-- CreateIndex
CREATE INDEX "meta_oauth_states_userId_createdAt_idx" ON "meta_oauth_states"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "meta_oauth_states_companyId_idx" ON "meta_oauth_states"("companyId");

-- CreateIndex
CREATE INDEX "meta_campaigns_companyId_idx" ON "meta_campaigns"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_campaigns_accountId_externalId_key" ON "meta_campaigns"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_ad_sets_accountId_campaignExternalId_idx" ON "meta_ad_sets"("accountId", "campaignExternalId");

-- CreateIndex
CREATE INDEX "meta_ad_sets_companyId_idx" ON "meta_ad_sets"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_sets_accountId_externalId_key" ON "meta_ad_sets"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_ads_accountId_adSetExternalId_idx" ON "meta_ads"("accountId", "adSetExternalId");

-- CreateIndex
CREATE INDEX "meta_ads_companyId_idx" ON "meta_ads"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ads_accountId_externalId_key" ON "meta_ads"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_creatives_companyId_idx" ON "meta_creatives"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_creatives_accountId_externalId_key" ON "meta_creatives"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "meta_insights_daily_accountId_level_date_idx" ON "meta_insights_daily"("accountId", "level", "date");

-- CreateIndex
CREATE INDEX "meta_insights_daily_companyId_idx" ON "meta_insights_daily"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_insights_daily_accountId_level_objectId_date_key" ON "meta_insights_daily"("accountId", "level", "objectId", "date");

-- CreateIndex
CREATE INDEX "meta_sync_runs_accountId_startedAt_idx" ON "meta_sync_runs"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "meta_sync_runs_companyId_idx" ON "meta_sync_runs"("companyId");

-- CreateIndex
CREATE INDEX "traffic_analyses_accountId_createdAt_idx" ON "traffic_analyses"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "traffic_analyses_companyId_idx" ON "traffic_analyses"("companyId");

-- CreateIndex
CREATE INDEX "traffic_actions_accountId_requestedAt_idx" ON "traffic_actions"("accountId", "requestedAt");

-- CreateIndex
CREATE INDEX "traffic_actions_status_expiresAt_idx" ON "traffic_actions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "traffic_actions_companyId_idx" ON "traffic_actions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_conversion_events_eventId_key" ON "meta_conversion_events"("eventId");

-- CreateIndex
CREATE INDEX "meta_conversion_events_status_nextAttemptAt_idx" ON "meta_conversion_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "meta_conversion_events_leadId_idx" ON "meta_conversion_events"("leadId");

-- CreateIndex
CREATE INDEX "meta_conversion_events_createdAt_idx" ON "meta_conversion_events"("createdAt");

-- CreateIndex
CREATE INDEX "meta_conversion_events_companyId_idx" ON "meta_conversion_events"("companyId");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

