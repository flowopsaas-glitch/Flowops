-- Additive migration: Rail Wave 3 — cancellation codes, slot change requests, possession windows, occurrence reports and dangerous-goods fields (RAIL-007, RAIL-009, RAIL-010, RAIL-011, RAIL-013, RAIL-015)
--
-- 10 enum(s), 4 table(s), 10 index(es) and 12 ALTER TABLE ... ADD COLUMN statement(s).
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
CREATE TYPE "RailCancellationParty" AS ENUM ('RAIL_OPERATIONS', 'INFRASTRUCTURE_MANAGER', 'FORCE_MAJEURE', 'ALLOCATION_REQUIRED');

-- CreateEnum
CREATE TYPE "RailAttribution" AS ENUM ('TRIM', 'TOC', 'FORCE_MAJEURE', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "RailChangeKind" AS ENUM ('CANCEL', 'RESCHEDULE', 'REPLAN');

-- CreateEnum
CREATE TYPE "RailChangeInitiator" AS ENUM ('TOC', 'YARD_OPERATOR', 'TRIM', 'PORT_TERMINAL_OPERATOR', 'PRASA_OTHER_IM');

-- CreateEnum
CREATE TYPE "RailChangeStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'ALTERNATIVE_PROPOSED', 'ACCEPTED', 'CANCELLED_CONFIRMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RailPossessionKind" AS ENUM ('ANNUAL_PLAN', 'LOCKED_60_DAY', 'AD_HOC_EMERGENCY');

-- CreateEnum
CREATE TYPE "RailPossessionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RailOccurrenceType" AS ENUM ('DERAILMENT', 'COLLISION', 'OHTE_CABLE_THEFT', 'SPAD', 'HAZMAT_SPILL', 'OTHER');

-- CreateEnum
CREATE TYPE "RailOccurrenceLevel" AS ENUM ('LEVEL_1_CODE_GREEN', 'LEVEL_2_CODE_ORANGE', 'LEVEL_3_CODE_RED');

-- CreateEnum
CREATE TYPE "RailOccurrenceStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'PRELIMINARY_REPORT_FILED', 'CLOSED');

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "unNumber" TEXT;

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "imdgClass" TEXT;

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "placardRef" TEXT;

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "emergencyContact24h" TEXT;

-- AlterTable
ALTER TABLE "rail_consignments" ADD COLUMN     "msdsDocumentUrl" TEXT;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "unNumber" TEXT;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "imdgClass" TEXT;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "placardRef" TEXT;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "emergencyContact24h" TEXT;

-- AlterTable
ALTER TABLE "wagons" ADD COLUMN     "msdsDocumentUrl" TEXT;

-- CreateTable
CREATE TABLE "rail_cancellation_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "responsibleParty" "RailCancellationParty" NOT NULL,
    "possibleParties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceText" TEXT NOT NULL,
    "annexureVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_cancellation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_slot_change_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "kind" "RailChangeKind" NOT NULL,
    "status" "RailChangeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "initiatedBy" "RailChangeInitiator" NOT NULL,
    "cancellationCode" TEXT NOT NULL,
    "cancellationReason" TEXT NOT NULL,
    "codeResponsibleParty" "RailCancellationParty" NOT NULL,
    "attribution" "RailAttribution" NOT NULL DEFAULT 'UNDETERMINED',
    "isForceMajeure" BOOLEAN NOT NULL DEFAULT false,
    "isPlannedOccupation" BOOLEAN NOT NULL DEFAULT false,
    "trainSlotRef" TEXT NOT NULL,
    "slotApplicationId" TEXT,
    "consignmentId" TEXT,
    "handshakeReportId" TEXT,
    "handshakeDeviationId" TEXT,
    "originalDeparture" TIMESTAMP(3),
    "proposedDeparture" TIMESTAMP(3),
    "eventOccurredAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "noticeLateMinutes" INTEGER,
    "hoursBeforeDeparture" DOUBLE PRECISION,
    "noticeBand" TEXT NOT NULL,
    "commercialWindow" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "penaltyApplicable" BOOLEAN NOT NULL DEFAULT false,
    "penaltyAgainst" TEXT,
    "penaltyBasis" TEXT,
    "requiresStaging" BOOLEAN NOT NULL DEFAULT false,
    "replacementAccepted" BOOLEAN,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_slot_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_possession_windows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "kind" "RailPossessionKind" NOT NULL,
    "status" "RailPossessionStatus" NOT NULL DEFAULT 'PLANNED',
    "title" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "imReference" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "noticeGivenAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_possession_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_occurrence_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "occurrenceNumber" TEXT NOT NULL,
    "type" "RailOccurrenceType" NOT NULL,
    "level" "RailOccurrenceLevel" NOT NULL,
    "status" "RailOccurrenceStatus" NOT NULL DEFAULT 'REPORTED',
    "corridorCode" TEXT,
    "location" TEXT,
    "trainSlotRef" TEXT,
    "consignmentId" TEXT,
    "deviationId" TEXT,
    "auditLogId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleParty" "RailAttribution" NOT NULL DEFAULT 'UNDETERMINED',
    "fatalities" BOOLEAN NOT NULL DEFAULT false,
    "hazmatInvolved" BOOLEAN NOT NULL DEFAULT false,
    "reportedToTcoAt" TIMESTAMP(3),
    "reportedToRsrAt" TIMESTAMP(3),
    "preliminaryReportDueAt" TIMESTAMP(3),
    "preliminaryReportFiledAt" TIMESTAMP(3),
    "investigationNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_occurrence_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rail_cancellation_codes_code_key" ON "rail_cancellation_codes"("code");

-- CreateIndex
CREATE INDEX "rail_slot_change_requests_companyId_status_idx" ON "rail_slot_change_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_slot_change_requests_companyId_consignmentId_idx" ON "rail_slot_change_requests"("companyId", "consignmentId");

-- CreateIndex
CREATE INDEX "rail_slot_change_requests_companyId_trainSlotRef_idx" ON "rail_slot_change_requests"("companyId", "trainSlotRef");

-- CreateIndex
CREATE UNIQUE INDEX "rail_slot_change_requests_companyId_requestNumber_key" ON "rail_slot_change_requests"("companyId", "requestNumber");

-- CreateIndex
CREATE INDEX "rail_possession_windows_companyId_corridorCode_startsAt_idx" ON "rail_possession_windows"("companyId", "corridorCode", "startsAt");

-- CreateIndex
CREATE INDEX "rail_possession_windows_companyId_status_idx" ON "rail_possession_windows"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_occurrence_reports_companyId_status_idx" ON "rail_occurrence_reports"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_occurrence_reports_companyId_occurredAt_idx" ON "rail_occurrence_reports"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "rail_occurrence_reports_companyId_occurrenceNumber_key" ON "rail_occurrence_reports"("companyId", "occurrenceNumber");
