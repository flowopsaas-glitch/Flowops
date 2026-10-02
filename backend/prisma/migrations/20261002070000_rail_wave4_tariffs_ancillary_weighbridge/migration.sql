-- Rail Wave 4: tariff schedules, Annexure 40 ancillary service catalogue, weighbridge readings, tariff calculations, consignment hold
--
-- 6 enum(s), 4 table(s), 8 index(es) and 4 ALTER TABLE ... ADD COLUMN statement(s).
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
CREATE TYPE "RailHoldStatus" AS ENUM ('NONE', 'HOLD_FOR_LOAD_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RailPriceStatus" AS ENUM ('NOT_PUBLISHED', 'TBD', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RailAncillaryGroup" AS ENUM ('RAIL', 'TELECOMS', 'SAFETY_EMERGENCY', 'PROPERTY');

-- CreateEnum
CREATE TYPE "RailLimitSource" AS ENUM ('CORRIDOR', 'MANUAL', 'NONE');

-- CreateEnum
CREATE TYPE "RailWeighStatus" AS ENUM ('WITHIN_LIMIT', 'OVERLOADED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "RailTariffCalcStatus" AS ENUM ('PRICED', 'INCOMPLETE');

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "holdStatus" "RailHoldStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "holdReason" TEXT;

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "holdSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "holdClearedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rail_tariff_schedules" (
    "id" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "loadedCentsPerGtk" DOUBLE PRECISION,
    "emptyCentsPerGtk" DOUBLE PRECISION,
    "dieselLitresPer1000Gtk" DOUBLE PRECISION,
    "electricKwhPer1000Gtk" DOUBLE PRECISION,
    "dieselPricePerLitreZar" DOUBLE PRECISION,
    "electricityPricePerKwhZar" DOUBLE PRECISION,
    "overloadPenaltyPerTonneZar" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_tariff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_ancillary_services" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serviceNumber" INTEGER NOT NULL,
    "serviceName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "section" TEXT,
    "description" TEXT,
    "unitOfMeasure" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "tierName" TEXT NOT NULL,
    "serviceGroup" "RailAncillaryGroup" NOT NULL,
    "isCompulsory" BOOLEAN NOT NULL DEFAULT false,
    "priceStatus" "RailPriceStatus" NOT NULL,
    "unitRateZar" DOUBLE PRECISION,
    "rateSourceRef" TEXT,
    "annexureVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_ancillary_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_weighbridge_readings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "wagonId" TEXT,
    "wagonNumber" TEXT NOT NULL,
    "weighbridge" TEXT,
    "weighedAt" TIMESTAMP(3) NOT NULL,
    "actualTonnes" DOUBLE PRECISION NOT NULL,
    "axles" INTEGER,
    "maxAxleLoadTonnes" DOUBLE PRECISION,
    "limitSource" "RailLimitSource" NOT NULL DEFAULT 'NONE',
    "corridorCode" TEXT,
    "allowedTonnes" DOUBLE PRECISION,
    "excessTonnes" DOUBLE PRECISION,
    "status" "RailWeighStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rail_weighbridge_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_tariff_calculations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calculationNumber" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "consignmentNumber" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "scheduleId" TEXT,
    "status" "RailTariffCalcStatus" NOT NULL,
    "inputs" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "gtkLoaded" DOUBLE PRECISION,
    "gtkEmpty" DOUBLE PRECISION,
    "subtotalZar" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "holdTriggered" BOOLEAN NOT NULL DEFAULT false,
    "invoiceDraftId" TEXT,
    "invoiceDraftedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_tariff_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rail_tariff_schedules_financialYear_idx" ON "rail_tariff_schedules"("financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "rail_tariff_schedules_corridorCode_financialYear_key" ON "rail_tariff_schedules"("corridorCode", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "rail_ancillary_services_code_key" ON "rail_ancillary_services"("code");

-- CreateIndex
CREATE INDEX "rail_ancillary_services_serviceNumber_idx" ON "rail_ancillary_services"("serviceNumber");

-- CreateIndex
CREATE INDEX "rail_ancillary_services_tier_idx" ON "rail_ancillary_services"("tier");

-- CreateIndex
CREATE INDEX "rail_weighbridge_readings_companyId_consignmentId_createdAt_idx" ON "rail_weighbridge_readings"("companyId", "consignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "rail_tariff_calculations_companyId_consignmentId_idx" ON "rail_tariff_calculations"("companyId", "consignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_tariff_calculations_companyId_calculationNumber_key" ON "rail_tariff_calculations"("companyId", "calculationNumber");
