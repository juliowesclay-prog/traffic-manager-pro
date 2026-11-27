-- CreateEnum
CREATE TYPE "ConversionKind" AS ENUM ('CADASTRO', 'VENDA');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'ERRO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "meta_conversion_events" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "ConversionKind" NOT NULL,
    "memberId" UUID NOT NULL,
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
CREATE UNIQUE INDEX "meta_conversion_events_eventId_key" ON "meta_conversion_events"("eventId");

-- CreateIndex
CREATE INDEX "meta_conversion_events_status_nextAttemptAt_idx" ON "meta_conversion_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "meta_conversion_events_memberId_idx" ON "meta_conversion_events"("memberId");

-- CreateIndex
CREATE INDEX "meta_conversion_events_createdAt_idx" ON "meta_conversion_events"("createdAt");


ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_value_ok" CHECK (
  ("kind" = 'VENDA' AND "valueCents" IS NOT NULL AND "valueCents" >= 0) OR ("kind" = 'CADASTRO' AND "valueCents" IS NULL)
);
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_attempts_ok" CHECK ("attempts" BETWEEN 0 AND 10);
