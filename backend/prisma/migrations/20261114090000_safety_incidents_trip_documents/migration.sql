-- ─────────────────────────────────────────────────────────────────────────────
-- Safety incidents and trip document packs
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two screens have been calling endpoints that did not exist:
--
--   GET/POST /api/v1/safety-incidents   (Safety Incident Report / Dispatch)
--   GET      /api/v1/trip-documents     (Trip Document Pack)
--
-- Neither `SafetyIncident` nor `TripDocument` was ever in the schema, so the
-- pages could not have worked. This creates both tables.
--
-- WHY THESE ARE ADDITIVE
-- ----------------------
-- Nothing is altered, dropped or backfilled. Two new tables, their indexes and
-- their tenant-isolation policies; every statement is CREATE. The migration is
-- therefore safe to apply against a live database and, if it ever needs to be
-- reversed, the down path is to drop both tables, with no data migration.
--
-- WHY THE POLICIES ARE INCLUDED HERE
-- ----------------------------------
-- Both tables carry a companyId, which makes them tenant tables, and a tenant
-- table without a policy is a hole that the RLS coverage report will never
-- mention — the report counts operations, not tables. The policy is applied in
-- the same migration as the table so the two cannot be separated by a deploy
-- that lands one and not the other.
--
-- Note that this makes the policies correct, not active. The application
-- connects as a superuser, and a superuser bypasses row-level security
-- including FORCE — see docs/RLS-PHASE2-READINESS-2026-11-12.md. The policies
-- take effect the moment the connection role changes, and not before.

-- safety_incidents
CREATE TABLE "safety_incidents" (
    "id"                  TEXT        NOT NULL,
    "companyId"           TEXT        NOT NULL,
    "type"                TEXT        NOT NULL,
    "severity"            TEXT        NOT NULL,
    "status"              TEXT        NOT NULL DEFAULT 'REPORTED',
    "reportedByDriverId"  TEXT,
    "reportedByUserId"    TEXT,
    "reportedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportLat"           DOUBLE PRECISION NOT NULL,
    "reportLng"           DOUBLE PRECISION NOT NULL,
    "locationSource"      TEXT        NOT NULL,
    "geohash6"            TEXT,
    "narrative"           TEXT,
    "zoneId"              TEXT,
    "verifiedByUserId"    TEXT,
    "verifiedAt"          TIMESTAMP(3),
    "rejectedByUserId"    TEXT,
    "rejectedAt"          TIMESTAMP(3),
    "rejectionReason"     TEXT,
    "broadcastCount"      INTEGER     NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "safety_incidents_companyId_idx" ON "safety_incidents"("companyId");
CREATE INDEX "safety_incidents_companyId_status_idx" ON "safety_incidents"("companyId", "status");
CREATE INDEX "safety_incidents_companyId_reportedAt_idx" ON "safety_incidents"("companyId", "reportedAt");

ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "safety_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safety_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "safety_incidents"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

-- trip_documents
CREATE TABLE "trip_documents" (
    "id"              TEXT        NOT NULL,
    "companyId"       TEXT        NOT NULL,
    "tripId"          TEXT        NOT NULL,
    "documentType"    TEXT        NOT NULL,
    "documentRef"     TEXT,
    "hsCode"          TEXT,
    "originStatus"    TEXT,
    "dutyEstimated"   DOUBLE PRECISION,
    "dutyActual"      DOUBLE PRECISION,
    "declarationRef"  TEXT,
    "capturedBy"      TEXT,
    "capturedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_documents_companyId_idx" ON "trip_documents"("companyId");
CREATE INDEX "trip_documents_companyId_tripId_idx" ON "trip_documents"("companyId", "tripId");

ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trip_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "trip_documents"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
