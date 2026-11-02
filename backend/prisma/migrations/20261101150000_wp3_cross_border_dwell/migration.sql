-- WP3: Cross-border dwell measurement (Stage 0).
-- Additive only: creates BorderPost, BorderGeofence, BorderDwellSession tables
-- with RLS tenant isolation. No changes to existing tables.

CREATE TABLE "border_posts" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countries" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "is24Hour" BOOLEAN NOT NULL DEFAULT FALSE,
  "referenceAvgWaitHours" DOUBLE PRECISION,
  "referenceCongestion" TEXT,
  "referenceCompiledAsOf" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "border_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "border_posts_companyId_idx" ON "border_posts"("companyId");

-- AddForeignKey
ALTER TABLE "border_posts" ADD CONSTRAINT "border_posts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "border_geofences" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "radiusM" INTEGER NOT NULL DEFAULT 1000,
  "side" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "provenance" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "border_geofences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "border_geofences_companyId_isActive_idx" ON "border_geofences"("companyId", "isActive");
CREATE INDEX "border_geofences_postId_idx" ON "border_geofences"("postId");

-- AddForeignKey
ALTER TABLE "border_geofences" ADD CONSTRAINT "border_geofences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_geofences" ADD CONSTRAINT "border_geofences_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "border_dwell_sessions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "geofenceId" TEXT NOT NULL,
  "driverId" TEXT,
  "vehicleReg" TEXT,
  "enteredAt" TIMESTAMP(3),
  "enteredFromFixAt" TIMESTAMP(3),
  "exitedAt" TIMESTAMP(3),
  "exitedFromFixAt" TIMESTAMP(3),
  "state" TEXT NOT NULL,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "precisionSeconds" INTEGER,
  "gapLargestSeconds" INTEGER,
  "direction" TEXT,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "border_dwell_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "border_dwell_sessions_companyId_idx" ON "border_dwell_sessions"("companyId");
CREATE INDEX "border_dwell_sessions_companyId_state_idx" ON "border_dwell_sessions"("companyId", "state");
CREATE INDEX "border_dwell_sessions_postId_state_idx" ON "border_dwell_sessions"("postId", "state");
CREATE INDEX "border_dwell_sessions_driverId_idx" ON "border_dwell_sessions"("driverId");

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "border_geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: tenant isolation for WP3 border dwell tables
ALTER TABLE "border_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "border_posts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "border_posts"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "border_geofences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "border_geofences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "border_geofences"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "border_dwell_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "border_dwell_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "border_dwell_sessions"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
