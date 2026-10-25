-- Trip cost entries: measured fuel/toll/other costs captured per driver and,
-- when known, per waybill or manifest. Raw material for per-trip margins
-- (delivery_cost_allocations). A trip with no entries has UNKNOWN fuel/toll
-- cost — never zero.
CREATE TYPE "TripCostType" AS ENUM ('FUEL', 'TOLL', 'OTHER');
CREATE TYPE "TripCostSource" AS ENUM ('DRIVER_APP', 'OFFICE', 'IMPORT');

CREATE TABLE "trip_cost_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "waybillId" TEXT,
    "manifestId" TEXT,
    "type" "TripCostType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "litres" DOUBLE PRECISION,
    "odometerKm" INTEGER,
    "note" TEXT,
    "receiptUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "TripCostSource" NOT NULL DEFAULT 'OFFICE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trip_cost_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_cost_entries_companyId_occurredAt_idx" ON "trip_cost_entries"("companyId", "occurredAt");
CREATE INDEX "trip_cost_entries_companyId_driverId_occurredAt_idx" ON "trip_cost_entries"("companyId", "driverId", "occurredAt");
CREATE INDEX "trip_cost_entries_waybillId_idx" ON "trip_cost_entries"("waybillId");

ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant isolation for the new table (same shape as the RLS migration;
-- kept here so fresh-database replay creates the table before its policy).
ALTER TABLE "trip_cost_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_cost_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "trip_cost_entries"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
