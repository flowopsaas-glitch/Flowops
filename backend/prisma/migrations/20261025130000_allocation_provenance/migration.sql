-- Trip Truth (Slice 2): provenance for delivery_cost_allocations so a cost
-- figure always declares its basis — measured from recorded trip-cost
-- entries, allocated from shared entries by a stated rule, or estimated
-- from config rates when nothing was recorded. Estimated rows must never
-- be blended into measured totals by readers.
CREATE TYPE "AllocationProvenance" AS ENUM ('MEASURED', 'ALLOCATED', 'ESTIMATED');

ALTER TABLE "delivery_cost_allocations" ADD COLUMN "otherCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "delivery_cost_allocations" ADD COLUMN "provenance" "AllocationProvenance";
ALTER TABLE "delivery_cost_allocations" ADD COLUMN "sourceEntryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "delivery_cost_allocations" ADD COLUMN "allocationNote" TEXT;
