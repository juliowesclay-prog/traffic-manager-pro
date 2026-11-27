-- Travas no banco (além das do servidor). Vieram do Prosed+ Saúde e agora valem POR EMPRESA.

-- Uma conexão ativa e uma conta escolhida por empresa.
CREATE UNIQUE INDEX "meta_connections_one_active" ON "meta_connections"("companyId") WHERE "status" = 'ATIVA';
CREATE UNIQUE INDEX "meta_ad_accounts_one_selected" ON "meta_ad_accounts"("companyId") WHERE "selected";
-- Conexão ativa sempre com chave; desconectada sempre sem chave e com data.
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_token_state" CHECK (
  ("status" = 'ATIVA' AND "tokenEnc" IS NOT NULL) OR
  ("status" = 'DESCONECTADA' AND "tokenEnc" IS NULL AND "disconnectedAt" IS NOT NULL)
);
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_account_id_format" CHECK ("accountId" ~ '^act_[0-9]+$');

-- Uma sincronização em execução por conta (evita duas ao mesmo tempo).
CREATE UNIQUE INDEX "meta_sync_runs_one_running" ON "meta_sync_runs"("companyId", "accountId") WHERE "status" = 'EXECUTANDO';
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_non_negative" CHECK (
  "spend" >= 0 AND "impressions" >= 0 AND "reach" >= 0 AND "clicks" >= 0 AND "linkClicks" >= 0 AND "purchaseValue" >= 0
);

-- Uma análise da IA em execução por conta (evita cobranças em dobro por clique repetido).
CREATE UNIQUE INDEX "traffic_analyses_one_running" ON "traffic_analyses"("companyId", "accountId") WHERE "status" = 'EXECUTANDO';
ALTER TABLE "traffic_analyses" ADD CONSTRAINT "traffic_analyses_period" CHECK ("periodDays" IN (7, 14, 30));
ALTER TABLE "traffic_analyses" ADD CONSTRAINT "traffic_analyses_tokens" CHECK (
  ("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
);

-- Ações na Meta:
-- 1) uma ação aberta (aguardando aprovação ou executando) por item;
CREATE UNIQUE INDEX "traffic_actions_one_open" ON "traffic_actions"("companyId", "accountId", "objectId")
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

-- API de Conversões.
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_value_ok" CHECK (
  ("kind" = 'VENDA' AND "valueCents" IS NOT NULL AND "valueCents" >= 0) OR ("kind" = 'CADASTRO' AND "valueCents" IS NULL)
);
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_attempts_ok" CHECK ("attempts" BETWEEN 0 AND 10);

-- Fonte de vendas: IDs da Meta só com números; valores nunca negativos; estorno coerente.
ALTER TABLE "leads" ADD CONSTRAINT "leads_ids_numeric" CHECK (
  ("campaignExternalId" IS NULL OR "campaignExternalId" ~ '^[0-9]{1,30}$') AND
  ("adSetExternalId" IS NULL OR "adSetExternalId" ~ '^[0-9]{1,30}$') AND
  ("adExternalId" IS NULL OR "adExternalId" ~ '^[0-9]{1,30}$')
);
ALTER TABLE "sales" ADD CONSTRAINT "sales_amount_ok" CHECK ("amount" >= 0 AND "amount" <= 100000000);
ALTER TABLE "sales" ADD CONSTRAINT "sales_refund_state" CHECK (
  ("status" = 'PAGA' AND "refundedAt" IS NULL) OR ("status" = 'ESTORNADA' AND "refundedAt" IS NOT NULL)
);
