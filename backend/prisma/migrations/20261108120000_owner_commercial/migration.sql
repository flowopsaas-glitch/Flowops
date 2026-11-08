-- Owner-managed commercial record per tenant.
--
-- The owner console has always been able to see what a tenant is DOING
-- (waybills, MRR, seats) but not where that tenant stands commercially:
-- whether they are being courted, are happy, are at risk, or are leaving.
-- That judgement lived in someone's head and in Slack threads.
--
-- Two things get added:
--
--   1. Three columns on the tenant recording the commercial status, the
--      reason for it, and when it changed. All nullable — a tenant nobody
--      has classified yet has NO status, which is a different fact from a
--      status of "none". The service refuses to write a status without a
--      reason, because a status alone tells the next person nothing about
--      what to do.
--
--   2. commercial_notes — the running record of what was said to a tenant.
--      Notes are owned by the platform and are deliberately NOT readable by
--      the tenant: there is no tenant-scoped read path, and the owner routes
--      sit behind OwnerAuthGuard.
--
-- Nothing is backfilled. Existing tenants simply have no status and no
-- notes until somebody records one.

-- AlterTable
ALTER TABLE "companies"
    ADD COLUMN "commercialStatus" TEXT,
    ADD COLUMN "commercialStatusReason" TEXT,
    ADD COLUMN "commercialStatusChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "commercial_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "tags" JSONB,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The only read pattern: a tenant's history, newest first.
CREATE INDEX "commercial_notes_companyId_createdAt_idx"
    ON "commercial_notes"("companyId", "createdAt");

-- AddForeignKey
-- Deleting a tenant takes its commercial history with it. There is nothing
-- left to discuss once the customer is gone.
ALTER TABLE "commercial_notes"
    ADD CONSTRAINT "commercial_notes_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Same phase-1 semantics as every other tenant table (see
-- 20261012210000_rls_tenant_isolation): when app.company_id is set the database
-- enforces isolation; when it is not, the app-level filters remain the boundary.
-- `src/db/rls-policy-coverage.spec.ts` fails the build if these are missing.
--
-- Commercial notes carry a companyId, so they are a tenant table whether or not
-- a tenant can ever read them: the owner console is the only reader today, but a
-- future tenant-facing view must not inherit an unguarded table.

-- commercial_notes
ALTER TABLE "commercial_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "commercial_notes"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
