-- CreateEnum
CREATE TYPE "BrandFactKind" AS ENUM ('PRODUTO', 'SERVICO', 'BENEFICIO', 'DIFERENCIAL', 'PRECO', 'INSTITUCIONAL');

-- CreateEnum
CREATE TYPE "BrandFactStatus" AS ENUM ('RASCUNHO', 'APROVADO');

-- CreateEnum
CREATE TYPE "CreativeKind" AS ENUM ('IMAGEM', 'CARROSSEL', 'VIDEO');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('RASCUNHO', 'EM_EDICAO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'ENVIADO_META', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "CreativeOrigin" AS ENUM ('IMPORTADO', 'IA', 'CANVA');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGEM', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('AGUARDANDO_ENVIO', 'PRONTO', 'REJEITADO');

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "socials" JSONB NOT NULL DEFAULT '{}',
    "about" TEXT,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "headingFont" TEXT,
    "bodyFont" TEXT,
    "ctas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoAssetId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_facts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "brandId" UUID NOT NULL,
    "kind" "BrandFactKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "BrandFactStatus" NOT NULL DEFAULT 'RASCUNHO',
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creatives" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "name" TEXT NOT NULL,
    "kind" "CreativeKind" NOT NULL,
    "status" "CreativeStatus" NOT NULL DEFAULT 'RASCUNHO',
    "origin" "CreativeOrigin" NOT NULL DEFAULT 'IMPORTADO',
    "brandId" UUID,
    "campaignId" UUID,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "approvedVersion" INTEGER,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_versions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "creativeId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL DEFAULT (current_setting('app.company_id'))::uuid,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "declaredType" TEXT NOT NULL,
    "declaredSize" BIGINT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "sha256" TEXT,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'AGUARDANDO_ENVIO',
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "rejectReason" TEXT,
    "purpose" TEXT NOT NULL,
    "versionId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_logoAssetId_key" ON "brands"("logoAssetId");

-- CreateIndex
CREATE INDEX "brands_companyId_idx" ON "brands"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_companyId_name_key" ON "brands"("companyId", "name");

-- CreateIndex
CREATE INDEX "brand_facts_companyId_idx" ON "brand_facts"("companyId");

-- CreateIndex
CREATE INDEX "brand_facts_brandId_idx" ON "brand_facts"("brandId");

-- CreateIndex
CREATE INDEX "creatives_companyId_createdAt_idx" ON "creatives"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "creatives_companyId_status_idx" ON "creatives"("companyId", "status");

-- CreateIndex
CREATE INDEX "creative_versions_companyId_idx" ON "creative_versions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "creative_versions_creativeId_number_key" ON "creative_versions"("creativeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_companyId_status_idx" ON "media_assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "media_assets_versionId_idx" ON "media_assets"("versionId");

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "creative_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─── Travas escritas à mão (o Prisma não expressa) ─────────────────

-- Cores oficiais só em #RRGGBB (no máximo 8); até 8 chamadas para ação.
ALTER TABLE "brands" ADD CONSTRAINT "brands_colors_ok" CHECK (
  cardinality("colors") <= 8 AND array_to_string("colors", ',') ~ '^(#[0-9A-F]{6}(,#[0-9A-F]{6})*)?$'
);
ALTER TABLE "brands" ADD CONSTRAINT "brands_ctas_ok" CHECK (cardinality("ctas") <= 8);
ALTER TABLE "brands" ADD CONSTRAINT "brands_name_len" CHECK (char_length("name") BETWEEN 2 AND 80);

-- Informação oficial: aprovada sempre com quem aprovou e quando; rascunho sem aprovação.
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_approval_ok" CHECK (
  ("status" = 'APROVADO' AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL) OR
  ("status" = 'RASCUNHO' AND "approvedById" IS NULL AND "approvedAt" IS NULL)
);
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_title_len" CHECK (char_length("title") BETWEEN 2 AND 200);

-- Criativo aprovado sempre registra quem aprovou e qual versão.
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_approval_ok" CHECK (
  "status" NOT IN ('APROVADO', 'ENVIADO_META')
  OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedVersion" IS NOT NULL)
);
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_version_ok" CHECK (
  "currentVersion" >= 1 AND ("approvedVersion" IS NULL OR "approvedVersion" BETWEEN 1 AND "currentVersion")
);
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_name_len" CHECK (char_length("name") BETWEEN 2 AND 120);

-- Arquivo pronto sempre conferido (tipo, tamanho e hash); vídeo pronto sempre com duração.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ready_ok" CHECK (
  "status" <> 'PRONTO' OR ("mimeType" IS NOT NULL AND "sizeBytes" > 0 AND "sha256" IS NOT NULL AND "readyAt" IS NOT NULL)
);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_video_duration" CHECK (
  "status" <> 'PRONTO' OR "kind" <> 'VIDEO' OR "durationMs" > 0
);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_purpose_ok" CHECK ("purpose" IN ('criativo', 'logo'));
-- Arquivo só entra numa versão depois de pronto.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_version_needs_ready" CHECK ("versionId" IS NULL OR "status" = 'PRONTO');
