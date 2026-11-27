-- CreateEnum
CREATE TYPE "TrafficAnalysisStatus" AS ENUM ('EXECUTANDO', 'OK', 'ERRO');

-- CreateTable
CREATE TABLE "traffic_analyses" (
    "id" UUID NOT NULL,
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

-- CreateIndex
CREATE INDEX "traffic_analyses_accountId_createdAt_idx" ON "traffic_analyses"("accountId", "createdAt");


-- Uma análise em execução por conta (evita cobranças em dobro por clique repetido).
CREATE UNIQUE INDEX "traffic_analyses_one_running" ON "traffic_analyses"("accountId") WHERE "status" = 'EXECUTANDO';
ALTER TABLE "traffic_analyses" ADD CONSTRAINT "traffic_analyses_period" CHECK ("periodDays" IN (7, 14, 30));
ALTER TABLE "traffic_analyses" ADD CONSTRAINT "traffic_analyses_tokens" CHECK (
  ("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
);
