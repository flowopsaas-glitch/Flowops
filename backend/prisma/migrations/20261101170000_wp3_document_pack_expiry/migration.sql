-- WP3 Stage 3: Cross-border document pack + expiry alerts.
-- Additive only: creates TripDocumentPack and DocumentExpiryThreshold tables
-- with RLS tenant isolation. References trips (created in previous migration).

CREATE TABLE "trip_document_pack" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'HELD',
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "capturedBy" TEXT,
  "evidenceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trip_document_pack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_document_pack_companyId_idx" ON "trip_document_pack"("companyId");
CREATE INDEX "trip_document_pack_tripId_idx" ON "trip_document_pack"("tripId");
CREATE INDEX "trip_document_pack_companyId_status_idx" ON "trip_document_pack"("companyId", "status");
CREATE INDEX "trip_document_pack_expiresAt_idx" ON "trip_document_pack"("expiresAt");

-- AddForeignKey
ALTER TABLE "trip_document_pack" ADD CONSTRAINT "trip_document_pack_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_document_pack" ADD CONSTRAINT "trip_document_pack_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "document_expiry_thresholds" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentType" TEXT,
  "thresholdDays" INTEGER NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_expiry_thresholds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_expiry_thresholds_companyId_documentType_key" ON "document_expiry_thresholds"("companyId", "documentType");
CREATE INDEX "document_expiry_thresholds_companyId_isActive_idx" ON "document_expiry_thresholds"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "document_expiry_thresholds" ADD CONSTRAINT "document_expiry_thresholds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: tenant isolation for WP3 document pack tables
ALTER TABLE "trip_document_pack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_document_pack" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "trip_document_pack"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "document_expiry_thresholds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_expiry_thresholds" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "document_expiry_thresholds"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
