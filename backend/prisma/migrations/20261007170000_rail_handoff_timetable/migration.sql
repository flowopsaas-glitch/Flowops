-- CreateEnum
CREATE TYPE "HandoffReadinessStatus" AS ENUM ('DRAFT', 'BLOCKED', 'READY', 'HANDED_OVER');

-- CreateEnum
CREATE TYPE "HandoffEvidenceType" AS ENUM ('RAIL_RELEASE', 'WAREHOUSE_RECEIPT', 'WAYBILL_SCAN', 'CARRIER_ACCEPTANCE', 'COD_RECONCILIATION', 'BILLING_RELEASE');

-- CreateEnum
CREATE TYPE "HandoffEvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "waybills" ADD COLUMN     "railConsignmentId" TEXT;

-- CreateTable
CREATE TABLE "rail_handoff_readiness" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "legId" TEXT,
    "warehouseId" TEXT,
    "status" "HandoffReadinessStatus" NOT NULL DEFAULT 'DRAFT',
    "blockedReasons" JSONB,
    "notes" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "handedOverBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_handoff_readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_handoff_evidence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "waybillId" TEXT,
    "type" "HandoffEvidenceType" NOT NULL,
    "status" "HandoffEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "evidenceUrl" TEXT,
    "capturedBy" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "rail_handoff_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_schedule_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedBy" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rail_schedule_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_schedule_rows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "importId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "train" TEXT NOT NULL,
    "nodeSequence" INTEGER,
    "corridor" TEXT,
    "station" TEXT NOT NULL,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "pointToPointRuntime" TEXT,
    "standingTime" TEXT,
    "standingReason" TEXT,
    "destination" TEXT,
    "originDepartureTime" TEXT,
    "destinationArrivalTime" TEXT,
    "scheduleCode" TEXT,
    "frequency" TEXT,
    "trainType" TEXT,
    "throughputRuntime" TEXT,
    "departDay" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "rawLine" TEXT NOT NULL,

    CONSTRAINT "rail_schedule_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rail_handoff_readiness_companyId_status_idx" ON "rail_handoff_readiness"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_handoff_readiness_consignmentId_idx" ON "rail_handoff_readiness"("consignmentId");

-- CreateIndex
CREATE INDEX "rail_handoff_readiness_warehouseId_idx" ON "rail_handoff_readiness"("warehouseId");

-- CreateIndex
CREATE INDEX "rail_handoff_evidence_companyId_type_status_idx" ON "rail_handoff_evidence"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "rail_handoff_evidence_readinessId_type_idx" ON "rail_handoff_evidence"("readinessId", "type");

-- CreateIndex
CREATE INDEX "rail_handoff_evidence_waybillId_idx" ON "rail_handoff_evidence"("waybillId");

-- CreateIndex
CREATE INDEX "rail_schedule_imports_companyId_importedAt_idx" ON "rail_schedule_imports"("companyId", "importedAt");

-- CreateIndex
CREATE INDEX "rail_schedule_imports_scopeKey_importedAt_idx" ON "rail_schedule_imports"("scopeKey", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rail_schedule_imports_scopeKey_sourceHash_key" ON "rail_schedule_imports"("scopeKey", "sourceHash");

-- CreateIndex
CREATE INDEX "rail_schedule_rows_importId_train_idx" ON "rail_schedule_rows"("importId", "train");

-- CreateIndex
CREATE INDEX "rail_schedule_rows_companyId_origin_train_idx" ON "rail_schedule_rows"("companyId", "origin", "train");

-- CreateIndex
CREATE UNIQUE INDEX "rail_schedule_rows_importId_sourceRow_key" ON "rail_schedule_rows"("importId", "sourceRow");

-- CreateIndex
CREATE INDEX "waybills_railConsignmentId_idx" ON "waybills"("railConsignmentId");

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_railConsignmentId_fkey" FOREIGN KEY ("railConsignmentId") REFERENCES "rail_consignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_consignments" ADD CONSTRAINT "rail_consignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_legId_fkey" FOREIGN KEY ("legId") REFERENCES "intermodal_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_evidence" ADD CONSTRAINT "rail_handoff_evidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_evidence" ADD CONSTRAINT "rail_handoff_evidence_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "rail_handoff_readiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_evidence" ADD CONSTRAINT "rail_handoff_evidence_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_schedule_imports" ADD CONSTRAINT "rail_schedule_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_schedule_rows" ADD CONSTRAINT "rail_schedule_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "rail_schedule_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
