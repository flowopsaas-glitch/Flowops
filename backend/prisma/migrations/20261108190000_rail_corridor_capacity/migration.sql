-- Rail corridor capacity — the missing half of slot allocation.
--
-- Slot applications ask for trainsPerWeek on a corridor over a window, and the
-- system records an application lifecycle right through to ALLOCATED. What it
-- has never had is any notion of how much the corridor can carry, so the only
-- signal that a corridor was over-committed was `conflictNote`: free text, set
-- by a human who happened to notice. Two applications could sit happily in
-- ALLOCATED on the same corridor over the same dates and nothing would object.
--
-- This adds a capacity ledger and an advisory check. It is deliberately
-- ADVISORY, never blocking: the infrastructure manager decides what is
-- allocated, and operators legitimately apply for more than they expect to be
-- granted. What the check does is let an operator see, before and after, how
-- much of a corridor they are already holding.
--
-- A train path occupies one slot on EVERY section it traverses, so a route's
-- ceiling is its BOTTLENECK section, never the sum of its sections. The
-- theoretical figure is what the bottleneck can pass; the practical figure
-- applies a capacity factor, because a timetable at 100% theoretical
-- utilisation is one delay away from collapse. The factor is stored, not
-- assumed, so a later recompute is auditable.
--
-- Tenant-scoped on purpose. FlowOps cannot see other operators' applications
-- and must not imply knowledge of what has been allocated to them, so the
-- check measures this operator's own commitments only. A corridor with no
-- statement yields UNKNOWN — not a number nobody can stand behind.

-- CreateEnum
CREATE TYPE "RailCapacityUnit" AS ENUM ('PATHS_PER_DAY', 'TRAINS_PER_WEEK');

-- CreateTable
CREATE TABLE "rail_corridor_capacity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "theoreticalPathsPerDay" DOUBLE PRECISION NOT NULL,
    "capacityFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "practicalPathsPerDay" DOUBLE PRECISION NOT NULL,
    "unit" "RailCapacityUnit" NOT NULL DEFAULT 'PATHS_PER_DAY',
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- One statement per corridor per period start, per tenant.
    CONSTRAINT "rail_corridor_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The only read patterns: a tenant's statements for one corridor, and the
-- statements covering a given period.
CREATE UNIQUE INDEX "rail_corridor_capacity_companyId_corridorCode_validFrom_key"
    ON "rail_corridor_capacity"("companyId", "corridorCode", "validFrom");
CREATE INDEX "rail_corridor_capacity_companyId_corridorCode_validFrom_validUntil_idx"
    ON "rail_corridor_capacity"("companyId", "corridorCode", "validFrom", "validUntil");

-- AddForeignKey
-- Deleting a tenant takes its capacity statements with it.
ALTER TABLE "rail_corridor_capacity"
    ADD CONSTRAINT "rail_corridor_capacity_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
-- Advisory snapshot columns on the application, alongside the existing gate
-- snapshots (envelopeCheck / complianceSnapshot) taken at submission.
ALTER TABLE "rail_slot_applications"
    ADD COLUMN "capacityCheckStatus" TEXT,
    ADD COLUMN "capacityCheck" JSONB;

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Same phase-1 semantics as every other tenant table (see
-- 20261012210000_rls_tenant_isolation): when app.company_id is set the database
-- enforces isolation; when it is not, the app-level filters remain the boundary.
-- `src/db/rls-policy-coverage.spec.ts` fails the build if these are missing.

-- rail_corridor_capacity
ALTER TABLE "rail_corridor_capacity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rail_corridor_capacity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "rail_corridor_capacity"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
