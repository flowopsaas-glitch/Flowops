-- WP4: Safety Incident Layer — claim/zone split.
-- Additive only: creates safety_incidents, safety_corroborations,
-- incident_broadcast_policies, safety_retention_sweeps tables with RLS;
-- adds expiresAt/incidentId to safety_zones; adds positionNulledAt to
-- safety_alerts. No changes to existing table semantics.

-- ── safety_incidents ────────────────────────────────────────────────────
CREATE TABLE "safety_incidents" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" TEXT NOT NULL DEFAULT 'REPORTED',
  "reportedByDriverId" TEXT,
  "reportedByUserId" TEXT,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportLat" DOUBLE PRECISION NOT NULL,
  "reportLng" DOUBLE PRECISION NOT NULL,
  "reportAccuracyM" INTEGER,
  "locationSource" TEXT NOT NULL,
  "geohash6" TEXT,
  "narrative" TEXT,
  "verifiedByUserId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verificationMethod" TEXT,
  "rejectedByUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "withdrawnAt" TIMESTAMP(3),
  "withdrawnByUserId" TEXT,
  "zoneId" TEXT,
  "broadcastCount" INTEGER NOT NULL DEFAULT 0,
  "lastBroadcastAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "safety_incidents_companyId_idx" ON "safety_incidents"("companyId");
CREATE INDEX "safety_incidents_companyId_status_idx" ON "safety_incidents"("companyId", "status");
CREATE INDEX "safety_incidents_companyId_type_idx" ON "safety_incidents"("companyId", "type");
CREATE INDEX "safety_incidents_geohash6_idx" ON "safety_incidents"("geohash6");
CREATE UNIQUE INDEX "safety_incidents_companyId_idempotencyKey_key" ON "safety_incidents"("companyId", "idempotencyKey");

ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reportedByDriverId_fkey" FOREIGN KEY ("reportedByDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_withdrawnByUserId_fkey" FOREIGN KEY ("withdrawnByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "safety_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── safety_corroborations ───────────────────────────────────────────────
CREATE TABLE "safety_corroborations" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "distanceM" INTEGER NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "safety_corroborations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "safety_corroborations_companyId_idx" ON "safety_corroborations"("companyId");
CREATE INDEX "safety_corroborations_incidentId_idx" ON "safety_corroborations"("incidentId");
CREATE UNIQUE INDEX "safety_corroborations_incidentId_driverId_key" ON "safety_corroborations"("incidentId", "driverId");

ALTER TABLE "safety_corroborations" ADD CONSTRAINT "safety_corroborations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "safety_corroborations" ADD CONSTRAINT "safety_corroborations_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "safety_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "safety_corroborations" ADD CONSTRAINT "safety_corroborations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── incident_broadcast_policies ─────────────────────────────────────────
CREATE TABLE "incident_broadcast_policies" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "incidentType" TEXT NOT NULL,
  "defaultRadiusM" INTEGER NOT NULL DEFAULT 1000,
  "capRadiusM" INTEGER NOT NULL DEFAULT 5000,
  "defaultTtlHours" INTEGER NOT NULL DEFAULT 3,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "incident_broadcast_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "incident_broadcast_policies_companyId_incidentType_key" ON "incident_broadcast_policies"("companyId", "incidentType");
CREATE INDEX "incident_broadcast_policies_companyId_isActive_idx" ON "incident_broadcast_policies"("companyId", "isActive");

ALTER TABLE "incident_broadcast_policies" ADD CONSTRAINT "incident_broadcast_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── safety_retention_sweeps ─────────────────────────────────────────────
CREATE TABLE "safety_retention_sweeps" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sweepType" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "rowsNulled" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "safety_retention_sweeps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "safety_retention_sweeps_companyId_idx" ON "safety_retention_sweeps"("companyId");
CREATE INDEX "safety_retention_sweeps_sweepType_idx" ON "safety_retention_sweeps"("sweepType");

ALTER TABLE "safety_retention_sweeps" ADD CONSTRAINT "safety_retention_sweeps_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── safety_zones: add expiresAt + incidentId ────────────────────────────
ALTER TABLE "safety_zones" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "safety_zones" ADD COLUMN "incidentId" TEXT;
ALTER TABLE "safety_zones" ADD CONSTRAINT "safety_zones_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "safety_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "safety_zones_incidentId_idx" ON "safety_zones"("incidentId");

-- ── safety_alerts: add positionNulledAt ─────────────────────────────────
ALTER TABLE "safety_alerts" ADD COLUMN "positionNulledAt" TIMESTAMP(3);

-- ── RLS: tenant isolation for WP4 tables ────────────────────────────────
ALTER TABLE "safety_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safety_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "safety_incidents"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "safety_corroborations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safety_corroborations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "safety_corroborations"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "incident_broadcast_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_broadcast_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "incident_broadcast_policies"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "safety_retention_sweeps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safety_retention_sweeps" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "safety_retention_sweeps"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
