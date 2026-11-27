-- CreateTable
CREATE TABLE "member_attributions" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "content" TEXT,
    "campaignExternalId" TEXT,
    "adSetExternalId" TEXT,
    "adExternalId" TEXT,
    "fbclid" TEXT,
    "landingPath" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_attributions_memberId_key" ON "member_attributions"("memberId");

-- CreateIndex
CREATE INDEX "member_attributions_campaignExternalId_idx" ON "member_attributions"("campaignExternalId");

-- CreateIndex
CREATE INDEX "member_attributions_adExternalId_idx" ON "member_attributions"("adExternalId");

-- AddForeignKey
ALTER TABLE "member_attributions" ADD CONSTRAINT "member_attributions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "member_attributions" ADD CONSTRAINT "member_attributions_ids_numeric" CHECK (
  ("campaignExternalId" IS NULL OR "campaignExternalId" ~ '^[0-9]{1,30}$') AND
  ("adSetExternalId" IS NULL OR "adSetExternalId" ~ '^[0-9]{1,30}$') AND
  ("adExternalId" IS NULL OR "adExternalId" ~ '^[0-9]{1,30}$')
);
