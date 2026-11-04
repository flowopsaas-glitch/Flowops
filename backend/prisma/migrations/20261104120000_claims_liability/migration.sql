-- Claims & liability — the domain a freight operator is asked about in every
-- client review, and which the platform had no record of at all.
--
-- Design notes that matter for anyone reading this migration:
--
--  * `waybillId`, `invoiceId` and `creditNoteId` are plain columns, not foreign
--    keys. A claim is evidence about a shipment: it must survive the shipment
--    being deleted, and it must not be silently cascaded away. The service
--    resolves the waybill at creation time and copies `waybillNumber` so the
--    claim still reads correctly afterwards.
--
--  * `liability` defaults to UNASSESSED and there is no default cap. The
--    approval path refuses to move until a human states who carries the loss.
--    An invented default here would be an invented legal position.
--
--  * `claim_events` is append-only in the application (nothing updates or
--    deletes a row), so a claim's history cannot be rewritten after the fact.

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('DAMAGE', 'LOSS', 'SHORTAGE', 'DELAY', 'THEFT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClaimLiability" AS ENUM ('UNASSESSED', 'CARRIER', 'INSURER', 'CLIENT', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "ClaimEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'NOTE_ADDED', 'EVIDENCE_ADDED', 'SETTLED');

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "waybillNumber" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "invoiceId" TEXT,
    "creditNoteId" TEXT,
    "creditNoteNumber" TEXT,
    "type" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "liability" "ClaimLiability" NOT NULL DEFAULT 'UNASSESSED',
    "liabilityBasis" TEXT,
    "liabilityCap" DOUBLE PRECISION,
    "claimedAmount" DOUBLE PRECISION NOT NULL,
    "approvedAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "incidentAt" TIMESTAMP(3),
    "evidence" JSONB,
    "metadata" JSONB,
    "rejectionReason" TEXT,
    "raisedById" TEXT,
    "raisedByName" TEXT,
    "assessedById" TEXT,
    "approvedById" TEXT,
    "respondBy" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ClaimEventType" NOT NULL,
    "fromStatus" "ClaimStatus",
    "toStatus" "ClaimStatus",
    "actorId" TEXT,
    "actorName" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claims_companyId_status_idx" ON "claims"("companyId", "status");

-- CreateIndex
CREATE INDEX "claims_companyId_createdAt_idx" ON "claims"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "claims_waybillId_idx" ON "claims"("waybillId");

-- CreateIndex
CREATE UNIQUE INDEX "claims_number_companyId_key" ON "claims"("number", "companyId");

-- CreateIndex
CREATE INDEX "claim_events_claimId_createdAt_idx" ON "claim_events"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "claim_events_companyId_createdAt_idx" ON "claim_events"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Same phase-1 semantics as every other tenant table (see
-- 20261012210000_rls_tenant_isolation): when app.company_id is set the database
-- enforces isolation; when it is not, the app-level filters remain the boundary.
-- `src/db/rls-policy-coverage.spec.ts` fails the build if these are missing.

-- claims
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "claims"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- claim_events
ALTER TABLE "claim_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "claim_events"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
