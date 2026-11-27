-- CreateEnum
CREATE TYPE "TrafficActionKind" AS ENUM ('PAUSAR', 'REATIVAR', 'ORCAMENTO');

-- CreateEnum
CREATE TYPE "TrafficActionStatus" AS ENUM ('PENDENTE', 'EXECUTANDO', 'EXECUTADA', 'RECUSADA', 'CANCELADA', 'EXPIRADA', 'FALHOU');

-- CreateTable
CREATE TABLE "traffic_actions" (
    "id" UUID NOT NULL,
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

-- CreateIndex
CREATE INDEX "traffic_actions_accountId_requestedAt_idx" ON "traffic_actions"("accountId", "requestedAt");

-- CreateIndex
CREATE INDEX "traffic_actions_status_expiresAt_idx" ON "traffic_actions"("status", "expiresAt");


-- Travas no banco (além das do servidor):
-- 1) uma ação aberta (aguardando aprovação ou executando) por item;
CREATE UNIQUE INDEX "traffic_actions_one_open" ON "traffic_actions"("accountId", "objectId")
  WHERE "status" IN ('PENDENTE', 'EXECUTANDO');
-- 2) ação que aumenta o gasto só executa com aprovação de OUTRA pessoa;
ALTER TABLE "traffic_actions" ADD CONSTRAINT "traffic_actions_spend_needs_other_approver" CHECK (
  NOT ("increasesSpend" AND "status" IN ('EXECUTANDO', 'EXECUTADA'))
  OR ("decidedById" IS NOT NULL AND "decidedById" <> "requestedById")
);
-- 3) orçamento: valores presentes e no mínimo R$ 1,00;
ALTER TABLE "traffic_actions" ADD CONSTRAINT "traffic_actions_budget_ok" CHECK (
  ("kind" <> 'ORCAMENTO' OR ("fromBudget" IS NOT NULL AND "toBudget" IS NOT NULL))
  AND ("toBudget" IS NULL OR "toBudget" >= 100)
);
-- 4) aumento de orçamento é sempre marcado como "aumenta o gasto"; reativar também.
ALTER TABLE "traffic_actions" ADD CONSTRAINT "traffic_actions_spend_flag" CHECK (
  ("kind" <> 'REATIVAR' OR "increasesSpend")
  AND ("kind" <> 'ORCAMENTO' OR "increasesSpend" = ("toBudget" > "fromBudget"))
  AND ("kind" <> 'PAUSAR' OR NOT "increasesSpend")
);
ALTER TABLE "traffic_actions" ADD CONSTRAINT "traffic_actions_reason_len" CHECK (char_length("reason") BETWEEN 10 AND 500);
