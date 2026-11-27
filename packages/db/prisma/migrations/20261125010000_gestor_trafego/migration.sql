-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('ATIVA', 'DESCONECTADA');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MARKETING';

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" UUID NOT NULL,
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
    "stateHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_connections_status_idx" ON "meta_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_accounts_connectionId_accountId_key" ON "meta_ad_accounts"("connectionId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_oauth_states_stateHash_key" ON "meta_oauth_states"("stateHash");

-- CreateIndex
CREATE INDEX "meta_oauth_states_userId_createdAt_idx" ON "meta_oauth_states"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Uma conexão ativa por vez e uma conta escolhida por vez.
CREATE UNIQUE INDEX "meta_connections_one_active" ON "meta_connections"("status") WHERE "status" = 'ATIVA';
CREATE UNIQUE INDEX "meta_ad_accounts_one_selected" ON "meta_ad_accounts"("selected") WHERE "selected";
-- Conexão ativa sempre com chave; desconectada sempre sem chave e com data.
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_token_state" CHECK (
  ("status" = 'ATIVA' AND "tokenEnc" IS NOT NULL) OR
  ("status" = 'DESCONECTADA' AND "tokenEnc" IS NULL AND "disconnectedAt" IS NOT NULL)
);
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_account_id_format" CHECK ("accountId" ~ '^act_[0-9]+$');
