-- Trip Truth (Slice 3): below-cost exception lifecycle on
-- delivery_cost_allocations. Exceptions only ever attach to MEASURED or
-- ALLOCATED rows — acting on an estimate would mean acting on a guess.
CREATE TYPE "MarginExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

ALTER TABLE "delivery_cost_allocations" ADD COLUMN "exceptionStatus" "MarginExceptionStatus";
ALTER TABLE "delivery_cost_allocations" ADD COLUMN "exceptionNote" TEXT;
ALTER TABLE "delivery_cost_allocations" ADD COLUMN "exceptionBy" TEXT;
ALTER TABLE "delivery_cost_allocations" ADD COLUMN "exceptionAt" TIMESTAMP(3);
