-- Additive migration: Rail Wave 2 — corridor / yard reference data, operator compliance documents and slot applications (RAIL-005, RAIL-006, RAIL-012)
--
-- 7 enum(s), 4 table(s), 9 index(es) and 3 ALTER TABLE ... ADD COLUMN statement(s).
-- STRICTLY ADDITIVE: only CREATE TYPE, CREATE TABLE, CREATE INDEX and ALTER TABLE ... ADD COLUMN.
-- No DROP, no ALTER COLUMN, no SET NOT NULL, no DELETE/UPDATE/INSERT, and no foreign keys (links to
-- existing tables are plain scalar references verified by the service layer, as in the older rail tables).
--
-- Provenance: the engine binaries (binaries.prisma.sh) were unreachable from the authoring sandbox, so
-- this file was rendered from schema.prisma's datamodel by a renderer that was first calibrated against
-- Prisma's own output — it reproduces 77 of 77 CreateEnum / CreateTable / CreateIndex statements of
-- 20260930143000_add_process_book_product_master byte-for-byte (whitespace-normalised). It was then
-- applied to a real PostgreSQL build (baseline + prior migrations + this one) and the resulting catalog
-- was compared with the datamodel column by column. CI's "Verify migrations match the schema (drift
-- guard)" step, which uses the real engine, remains the authority.
--
-- Rollback (nothing here is destructive, so rolling back is a deliberate act, not a recovery):
--   see docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md.

-- CreateEnum
CREATE TYPE "RailGauge" AS ENUM ('CAPE_1067MM', 'NARROW_610MM', 'STANDARD_1435MM');

-- CreateEnum
CREATE TYPE "RailElectrification" AS ENUM ('DC_3KV', 'AC_25KV', 'AC_50KV', 'DIESEL');

-- CreateEnum
CREATE TYPE "RailVehicleProfile" AS ENUM ('A', 'B', 'B_PLUS_1');

-- CreateEnum
CREATE TYPE "RailDataStatus" AS ENUM ('SOURCE_PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "RailComplianceDocType" AS ENUM ('RSR_PERMIT', 'INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT', 'DANGEROUS_GOODS', 'INTERFACE_AGREEMENT', 'ACCESS_CONTRACT', 'SECURITY_DEPOSIT');

-- CreateEnum
CREATE TYPE "RailComplianceDocStatus" AS ENUM ('PENDING_REVIEW', 'VALID', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RailSlotApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT', 'ALLOCATED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "axles" INTEGER;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "gauge" "RailGauge";

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "vehicleProfile" "RailVehicleProfile";

-- CreateTable
CREATE TABLE "rail_corridor_nodes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workbookRoutes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "gauge" "RailGauge",
    "electrification" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxAxleLoadTonnes" DOUBLE PRECISION,
    "vehicleProfile" "RailVehicleProfile",
    "maxTrainLengthM" INTEGER,
    "contacts" JSONB,
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_corridor_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_yard_specs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "corridorCode" TEXT,
    "isTransferYard" BOOLEAN NOT NULL DEFAULT true,
    "gauge" "RailGauge",
    "electrification" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxAxleLoadTonnes" DOUBLE PRECISION,
    "vehicleProfile" "RailVehicleProfile",
    "maxTrainLengthM" INTEGER,
    "sidingCapacityWagons" INTEGER,
    "contacts" JSONB,
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_yard_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_operator_compliance_docs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" "RailComplianceDocType" NOT NULL,
    "status" "RailComplianceDocStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "referenceNumber" TEXT,
    "issuer" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedByEmail" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_operator_compliance_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_slot_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "status" "RailSlotApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "corridorCode" TEXT NOT NULL,
    "originName" TEXT,
    "destinationName" TEXT,
    "originYardCode" TEXT,
    "destinationYardCode" TEXT,
    "railOperator" TEXT,
    "imReference" TEXT,
    "tractionType" "RailElectrification",
    "commodity" TEXT,
    "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false,
    "trainsPerWeek" INTEGER,
    "wagonsPerTrain" INTEGER,
    "annualTonnes" DOUBLE PRECISION,
    "gauge" "RailGauge",
    "axleLoadTonnes" DOUBLE PRECISION,
    "vehicleProfile" "RailVehicleProfile",
    "trainLengthM" INTEGER,
    "requestedFrom" TIMESTAMP(3) NOT NULL,
    "requestedUntil" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "selfScreening" JSONB,
    "selfScreeningAccessType" TEXT,
    "selfScreeningCompletedAt" TIMESTAMP(3),
    "envelopeCheckStatus" TEXT,
    "envelopeCheck" JSONB,
    "complianceSnapshot" JSONB,
    "submittedAt" TIMESTAMP(3),
    "assessmentStartedAt" TIMESTAMP(3),
    "conflictFlaggedAt" TIMESTAMP(3),
    "conflictNote" TEXT,
    "allocatedAt" TIMESTAMP(3),
    "mobilizeBy" TIMESTAMP(3),
    "firstOperatedAt" TIMESTAMP(3),
    "forfeitureFlaggedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiredAt" TIMESTAMP(3),
    "consignmentId" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_slot_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rail_corridor_nodes_code_key" ON "rail_corridor_nodes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rail_yard_specs_code_key" ON "rail_yard_specs"("code");

-- CreateIndex
CREATE INDEX "rail_yard_specs_corridorCode_idx" ON "rail_yard_specs"("corridorCode");

-- CreateIndex
CREATE INDEX "rail_operator_compliance_docs_companyId_docType_idx" ON "rail_operator_compliance_docs"("companyId", "docType");

-- CreateIndex
CREATE INDEX "rail_operator_compliance_docs_companyId_validUntil_idx" ON "rail_operator_compliance_docs"("companyId", "validUntil");

-- CreateIndex
CREATE INDEX "rail_slot_applications_companyId_status_idx" ON "rail_slot_applications"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_slot_applications_companyId_corridorCode_idx" ON "rail_slot_applications"("companyId", "corridorCode");

-- CreateIndex
CREATE INDEX "rail_slot_applications_status_mobilizeBy_idx" ON "rail_slot_applications"("status", "mobilizeBy");

-- CreateIndex
CREATE UNIQUE INDEX "rail_slot_applications_companyId_applicationNumber_key" ON "rail_slot_applications"("companyId", "applicationNumber");
