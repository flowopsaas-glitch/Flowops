-- Asset maintenance & warranty.
--
-- Maintenance used to hang off `Driver`: a service record needed a person to
-- attach to. That is wrong for the equipment this platform accounts for — a
-- reach stacker, an RTG, a genset, a trailer — none of which has a driver and
-- all of which carry the cost of standing still. This migration adds the axis:
-- an asset register, job cards against it, the cost lines on those cards, and a
-- warranty window that is a number of days or nothing at all.
--
-- Design notes that matter for anyone reading this:
--
--  * `companyId` is a plain column, not a foreign key, matching every other
--    tenant table here. Isolation is enforced by RLS (below) and by the
--    service's companyId filter, not by cascade.
--
--  * There is no `warranty: lifetime` value. `warrantyTermDays` is INTEGER and
--    nullable; NULL means "no term recorded", which is why the warranty
--    position has three states (in / out / unknown) rather than two. Turning an
--    unrecorded promise into "out of warranty" would quietly make an operator's
--    own rework chargeable.
--
--  * `downtimeMinutes` is derived in code from the card's own timestamps and is
--    never accepted from a caller. It is NULL for planned work and inspections,
--    because scheduled unavailability is not lost availability.
--
--  * `maintenance_jobs.assetId` is ON DELETE RESTRICT: a unit with cards on it
--    cannot be removed out from under its own history. `maintenance_job_costs`
--    and `maintenance_job_events` cascade from their job, which the application
--    never deletes — cancellation is a status with a reason.
--
--  * `maintenance_job_events` is append-only in the application. Nothing
--    updates or deletes a row, so a job card's history cannot be rewritten.

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('REACH_STACKER', 'RTG', 'RMG', 'STRADDLE_CARRIER', 'FORKLIFT', 'TRACTOR', 'TRUCK', 'HAULER', 'TRAILER', 'GENSET', 'CRANE', 'PUMP', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetMeterType" AS ENUM ('HOURS', 'KM');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_SERVICE', 'DOWN', 'UNDER_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaintenanceJobType" AS ENUM ('BREAKDOWN', 'PLANNED', 'INSPECTION', 'RECALL');

-- CreateEnum
CREATE TYPE "MaintenanceJobStatus" AS ENUM ('REPORTED', 'IN_PROGRESS', 'COMPLETED', 'SIGNED_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceCostKind" AS ENUM ('PART', 'LABOUR', 'OUTSIDE_SERVICE', 'TRAVEL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "MaintenanceEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'METER_RECORDED', 'COST_ADDED', 'NOTE_ADDED', 'COMEBACK_LINKED', 'WARRANTY_SET');

-- CreateTable
CREATE TABLE "maintenance_assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT,
    "assetClass" "AssetClass" NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "custodian" TEXT,
    "site" TEXT,
    "meterType" "AssetMeterType" NOT NULL DEFAULT 'HOURS',
    "meterReading" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meterReadAt" TIMESTAMP(3),
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "commissionedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "warrantySupplier" TEXT,
    "warrantyStartAt" TIMESTAMP(3),
    "warrantyTermDays" INTEGER,
    "warrantyServiceIntervalDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_meter_readings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "reading" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "jobId" TEXT,
    "recordedByName" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_fault_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "guidance" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_fault_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "type" "MaintenanceJobType" NOT NULL,
    "status" "MaintenanceJobStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedByName" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "signedOffAt" TIMESTAMP(3),
    "signedOffBy" TEXT,
    "faultCodeId" TEXT,
    "faultDescription" TEXT NOT NULL,
    "workPerformed" TEXT,
    "downtimeMinutes" INTEGER,
    "meterAtJob" DOUBLE PRECISION,
    "priorJobId" TEXT,
    "warrantyTermDays" INTEGER,
    "warrantyExpiresAt" TIMESTAMP(3),
    "labourHours" DOUBLE PRECISION,
    "providerName" TEXT,
    "invoiceRef" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_job_costs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "MaintenanceCostKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_job_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_job_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "MaintenanceEventType" NOT NULL,
    "fromStatus" "MaintenanceJobStatus",
    "toStatus" "MaintenanceJobStatus",
    "actorId" TEXT,
    "actorName" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_assets_companyId_status_idx" ON "maintenance_assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "maintenance_assets_companyId_assetClass_idx" ON "maintenance_assets"("companyId", "assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_assets_companyId_assetCode_key" ON "maintenance_assets"("companyId", "assetCode");

-- CreateIndex
CREATE INDEX "maintenance_meter_readings_assetId_readAt_idx" ON "maintenance_meter_readings"("assetId", "readAt");

-- CreateIndex
CREATE INDEX "maintenance_meter_readings_companyId_readAt_idx" ON "maintenance_meter_readings"("companyId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_fault_codes_companyId_code_key" ON "maintenance_fault_codes"("companyId", "code");

-- CreateIndex
CREATE INDEX "maintenance_fault_codes_companyId_active_idx" ON "maintenance_fault_codes"("companyId", "active");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_status_idx" ON "maintenance_jobs"("companyId", "status");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_reportedAt_idx" ON "maintenance_jobs"("companyId", "reportedAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_assetId_reportedAt_idx" ON "maintenance_jobs"("assetId", "reportedAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_warrantyExpiresAt_idx" ON "maintenance_jobs"("companyId", "warrantyExpiresAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_faultCodeId_idx" ON "maintenance_jobs"("faultCodeId");

-- CreateIndex
CREATE INDEX "maintenance_jobs_priorJobId_idx" ON "maintenance_jobs"("priorJobId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_jobs_companyId_jobNumber_key" ON "maintenance_jobs"("companyId", "jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_jobs_companyId_idempotencyKey_key" ON "maintenance_jobs"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "maintenance_job_costs_jobId_idx" ON "maintenance_job_costs"("jobId");

-- CreateIndex
CREATE INDEX "maintenance_job_costs_companyId_kind_idx" ON "maintenance_job_costs"("companyId", "kind");

-- CreateIndex
CREATE INDEX "maintenance_job_events_jobId_createdAt_idx" ON "maintenance_job_events"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "maintenance_job_events_companyId_createdAt_idx" ON "maintenance_job_events"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "maintenance_meter_readings" ADD CONSTRAINT "maintenance_meter_readings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "maintenance_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "maintenance_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_faultCodeId_fkey" FOREIGN KEY ("faultCodeId") REFERENCES "maintenance_fault_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_priorJobId_fkey" FOREIGN KEY ("priorJobId") REFERENCES "maintenance_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job_costs" ADD CONSTRAINT "maintenance_job_costs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "maintenance_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job_events" ADD CONSTRAINT "maintenance_job_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "maintenance_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Same phase-1 semantics as every other tenant table (see
-- 20261012210000_rls_tenant_isolation): when app.company_id is set the database
-- enforces isolation; when it is not, the app-level filters remain the boundary.
-- `src/db/rls-policy-coverage.spec.ts` fails the build if these are missing.

-- maintenance_assets
ALTER TABLE "maintenance_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_assets"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- maintenance_meter_readings
ALTER TABLE "maintenance_meter_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_meter_readings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_meter_readings"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- maintenance_fault_codes
ALTER TABLE "maintenance_fault_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_fault_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_fault_codes"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- maintenance_jobs
ALTER TABLE "maintenance_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_jobs"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- maintenance_job_costs
ALTER TABLE "maintenance_job_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_job_costs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_job_costs"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- maintenance_job_events
ALTER TABLE "maintenance_job_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_job_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_job_events"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
