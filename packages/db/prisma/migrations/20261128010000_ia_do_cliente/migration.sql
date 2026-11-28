-- CreateTable
CREATE TABLE "ai_credentials" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "provider" TEXT NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "lastTestedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_credentials_companyId_key" ON "ai_credentials"("companyId");


-- Travas escritas à mão: só provedores conhecidos e dica com no máximo 4 caracteres (nunca a chave).
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_provider_check" CHECK ("provider" IN ('claude', 'openai'));
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_hint_check" CHECK (char_length("keyHint") <= 4);
