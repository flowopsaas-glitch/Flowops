-- WP3: Journey, Trip corridor split, HS code / origin / duty (Stage 4 + Stage 5)
-- Additive only: creates new tables and enums, adds Stage 5 columns to trips.
-- No existing table is dropped, renamed, or altered in a breaking way.

-- ════════════════════════════════════════════════════════════════════════════════
-- WP2: Journey enums
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TYPE "JourneyStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "JourneyStageStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "JourneyUpdateStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'ASSIGNED', 'RESOLVED', 'REJECTED');
CREATE TYPE "JourneyUpdateType" AS ENUM ('ETA_CHANGE', 'DELAY_REPORT', 'INCIDENT_REPORT', 'PROOF_OF_DELIVERY', 'GENERAL_NOTE');
CREATE TYPE "JourneyStageType" AS ENUM ('BORDER', 'CLEARING', 'BOND', 'EMPTY_RETURN', 'LINEHAUL');

-- ════════════════════════════════════════════════════════════════════════════════
-- WP2: Journey tables
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "journeys" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "driverId"      TEXT,
  "reference"     TEXT NOT NULL,
  "origin"        TEXT,
  "destination"   TEXT,
  "plannedStart"  TIMESTAMP(3),
  "plannedEnd"    TIMESTAMP(3),
  "status"        "JourneyStatus" NOT NULL DEFAULT 'PLANNED',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journeys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journeys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "journeys_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL
);

CREATE INDEX "journeys_companyId_idx" ON "journeys"("companyId");
CREATE INDEX "journeys_driverId_createdAt_idx" ON "journeys"("driverId", "createdAt");
CREATE INDEX "journeys_companyId_status_idx" ON "journeys"("companyId", "status");

CREATE TABLE "journey_stages" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "journeyId"     TEXT NOT NULL,
  "stageNumber"   INTEGER NOT NULL,
  "type"          "JourneyStageType" NOT NULL,
  "locationName"  TEXT,
  "locationRef"   TEXT,
  "plannedAt"     TIMESTAMP(3),
  "status"        "JourneyStageStatus" NOT NULL DEFAULT 'PLANNED',
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journey_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journey_stages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_stages_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE
);

CREATE INDEX "journey_stages_companyId_idx" ON "journey_stages"("companyId");
CREATE INDEX "journey_stages_journeyId_stageNumber_idx" ON "journey_stages"("journeyId", "stageNumber");
CREATE UNIQUE INDEX "journey_stages_journeyId_stageNumber_key" ON "journey_stages"("journeyId", "stageNumber");

CREATE TABLE "journey_updates" (
  "id"                 TEXT NOT NULL,
  "companyId"          TEXT NOT NULL,
  "journeyId"          TEXT NOT NULL,
  "stageId"            TEXT,
  "type"               "JourneyUpdateType" NOT NULL,
  "message"            TEXT NOT NULL,
  "clientMessageId"    TEXT,
  "deviceOccurredAt"   TIMESTAMP(3),
  "serverReceivedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"             "JourneyUpdateStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journey_updates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journey_updates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_updates_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_updates_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "journey_stages"("id") ON DELETE SET NULL
);

CREATE INDEX "journey_updates_companyId_idx" ON "journey_updates"("companyId");
CREATE INDEX "journey_updates_journeyId_idx" ON "journey_updates"("journeyId");
CREATE INDEX "journey_updates_stageId_idx" ON "journey_updates"("stageId");
CREATE INDEX "journey_updates_clientMessageId_idx" ON "journey_updates"("clientMessageId");

-- ════════════════════════════════════════════════════════════════════════════════
-- WP3 Stage 4: Border infrastructure tables
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "border_posts" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "countries"  TEXT NOT NULL,
  "lat"        DOUBLE PRECISION NOT NULL,
  "lng"        DOUBLE PRECISION NOT NULL,
  "is24Hour"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "border_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "border_posts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE
);

CREATE INDEX "border_posts_companyId_idx" ON "border_posts"("companyId");
CREATE UNIQUE INDEX "border_posts_companyId_code_key" ON "border_posts"("companyId", "code");

CREATE TABLE "border_geofences" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "postId"     TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "lat"        DOUBLE PRECISION NOT NULL,
  "lng"        DOUBLE PRECISION NOT NULL,
  "radiusM"    INTEGER NOT NULL,
  "side"       TEXT NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "provenance" TEXT NOT NULL DEFAULT 'SEED',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "border_geofences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "border_geofences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "border_geofences_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE CASCADE
);

CREATE INDEX "border_geofences_companyId_idx" ON "border_geofences"("companyId");
CREATE INDEX "border_geofences_postId_idx" ON "border_geofences"("postId");

CREATE TABLE "border_dwell_sessions" (
  "id"                 TEXT NOT NULL,
  "companyId"          TEXT NOT NULL,
  "postId"             TEXT NOT NULL,
  "geofenceId"         TEXT NOT NULL,
  "driverId"           TEXT,
  "state"              TEXT NOT NULL,
  "enteredAt"          TIMESTAMP(3) NOT NULL,
  "enteredFromFixAt"   TIMESTAMP(3),
  "exitedAt"           TIMESTAMP(3),
  "exitedFromFixAt"    TIMESTAMP(3),
  "sampleCount"        INTEGER NOT NULL DEFAULT 0,
  "precisionSeconds"   INTEGER,
  "gapLargestSeconds"  INTEGER,
  "direction"          TEXT NOT NULL,
  "source"             TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "border_dwell_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "border_dwell_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "border_dwell_sessions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "border_dwell_sessions_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "border_geofences"("id") ON DELETE CASCADE,
  CONSTRAINT "border_dwell_sessions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL
);

CREATE INDEX "border_dwell_sessions_companyId_idx" ON "border_dwell_sessions"("companyId");
CREATE INDEX "border_dwell_sessions_postId_idx" ON "border_dwell_sessions"("postId");
CREATE INDEX "border_dwell_sessions_geofenceId_idx" ON "border_dwell_sessions"("geofenceId");
CREATE INDEX "border_dwell_sessions_driverId_idx" ON "border_dwell_sessions"("driverId");
CREATE INDEX "border_dwell_sessions_state_idx" ON "border_dwell_sessions"("state");

-- ════════════════════════════════════════════════════════════════════════════════
-- WP3 Stage 4 + Stage 5: Trip and TripLeg tables
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TYPE "TripLegKind" AS ENUM ('LINEHAUL', 'BORDER', 'CLEARING', 'BOND', 'EMPTY_RETURN');
CREATE TYPE "OriginStatus" AS ENUM ('PREFERENTIAL', 'NON_PREFERENTIAL', 'UNKNOWN');
CREATE TYPE "TripDutyProvenance" AS ENUM ('ESTIMATED', 'ACTUAL');

CREATE TABLE "trips" (
  "id"                   TEXT NOT NULL,
  "companyId"            TEXT NOT NULL,
  "driverId"             TEXT,
  "reference"            TEXT NOT NULL,
  "origin"               TEXT,
  "destination"          TEXT,
  "plannedStart"         TIMESTAMP(3),
  "plannedEnd"           TIMESTAMP(3),
  "actualStart"          TIMESTAMP(3),
  "actualEnd"            TIMESTAMP(3),
  "status"               TEXT NOT NULL DEFAULT 'PLANNED',
  -- ── WP3 Stage 5: HS code, origin status, duty ESTIMATED vs ACTUAL ─────
  "hsCode"               TEXT,
  "originStatus"         "OriginStatus" NOT NULL DEFAULT 'UNKNOWN',
  "certificateOfOriginRef" TEXT,
  "dutyEstimated"        DOUBLE PRECISION,
  "estimateSource"       TEXT,
  "estimateVersion"      TEXT,
  "estimatedAt"          TIMESTAMP(3),
  "dutyActual"           DOUBLE PRECISION,
  "declarationRef"       TEXT,
  "capturedBy"           TEXT,
  "capturedAt"           TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trips_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL
);

CREATE INDEX "trips_companyId_idx" ON "trips"("companyId");
CREATE INDEX "trips_driverId_createdAt_idx" ON "trips"("driverId", "createdAt");
CREATE INDEX "trips_companyId_status_idx" ON "trips"("companyId", "status");

CREATE TABLE "trip_legs" (
  "id"             TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "tripId"         TEXT NOT NULL,
  "kind"           "TripLegKind" NOT NULL,
  "postId"         TEXT,
  "dwellSessionId" TEXT,
  "startedAt"      TIMESTAMP(3),
  "endedAt"        TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "provenance"     TEXT NOT NULL,
  "source"         TEXT,
  "confidenceNote" TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trip_legs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trip_legs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "trip_legs_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE,
  CONSTRAINT "trip_legs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE SET NULL,
  CONSTRAINT "trip_legs_dwellSessionId_fkey" FOREIGN KEY ("dwellSessionId") REFERENCES "border_dwell_sessions"("id") ON DELETE SET NULL
);

CREATE INDEX "trip_legs_companyId_idx" ON "trip_legs"("companyId");
CREATE INDEX "trip_legs_tripId_idx" ON "trip_legs"("tripId");
CREATE INDEX "trip_legs_postId_idx" ON "trip_legs"("postId");
CREATE INDEX "trip_legs_dwellSessionId_idx" ON "trip_legs"("dwellSessionId");

-- ════════════════════════════════════════════════════════════════════════════════
-- WP3 Stage 5: Row Level Security — cross-tenant isolation at the database layer
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips" FORCE ROW LEVEL SECURITY;
CREATE POLICY "trips_tenant_isolation" ON "trips"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "trip_legs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_legs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "trip_legs_tenant_isolation" ON "trip_legs"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "border_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "border_posts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "border_posts_tenant_isolation" ON "border_posts"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "border_geofences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "border_geofences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "border_geofences_tenant_isolation" ON "border_geofences"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "border_dwell_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "border_dwell_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "border_dwell_sessions_tenant_isolation" ON "border_dwell_sessions"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "journeys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journeys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journeys_tenant_isolation" ON "journeys"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "journey_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journey_stages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journey_stages_tenant_isolation" ON "journey_stages"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "journey_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journey_updates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journey_updates_tenant_isolation" ON "journey_updates"
  FOR ALL TO PUBLIC
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
