-- WP3 Stage 4: Trip corridor split with provenance labels.
-- Additive only: creates Trip and TripLeg tables with RLS tenant isolation.
-- References border_dwell_sessions and border_posts created in the previous migration.

CREATE TABLE "trips" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "driverId" TEXT,
  "vehicleReg" TEXT,
  "origin" TEXT,
  "destination" TEXT,
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "actualStart" TIMESTAMP(3),
  "actualEnd" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trips_companyId_status_idx" ON "trips"("companyId", "status");
CREATE INDEX "trips_driverId_createdAt_idx" ON "trips"("driverId", "createdAt");
CREATE INDEX "trips_companyId_createdAt_idx" ON "trips"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "trip_legs" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "postId" TEXT,
  "dwellSessionId" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "provenance" TEXT NOT NULL DEFAULT 'REFERENCE',
  "source" TEXT,
  "confidenceNote" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trip_legs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_legs_tripId_kind_idx" ON "trip_legs"("tripId", "kind");
CREATE INDEX "trip_legs_companyId_kind_idx" ON "trip_legs"("companyId", "kind");
CREATE INDEX "trip_legs_postId_idx" ON "trip_legs"("postId");

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_dwellSessionId_fkey" FOREIGN KEY ("dwellSessionId") REFERENCES "border_dwell_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: tenant isolation for WP3 trip leg tables
ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "trips"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "trip_legs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_legs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "trip_legs"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
