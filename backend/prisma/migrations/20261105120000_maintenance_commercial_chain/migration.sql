-- The commercial chain on a job card.
--
-- A repair takes five days. Getting permission to start it takes however long
-- procurement takes, and until now the card recorded neither. The six nullable
-- columns below are the steps between "the machine failed" and "the money
-- arrived": quoted, authorised, worked, invoiced, paid.
--
-- Nothing here is backfilled. A null date means the step is unknown, which is a
-- different fact from "did not happen" and a very different fact from "took
-- zero days". Inventing a default would have made every historical card claim a
-- promptness it never had.

-- AlterTable
ALTER TABLE "maintenance_jobs"
    ADD COLUMN "quotationAmount" DOUBLE PRECISION,
    ADD COLUMN "quotationAt" TIMESTAMP(3),
    ADD COLUMN "purchaseOrderNumber" TEXT,
    ADD COLUMN "purchaseOrderAt" TIMESTAMP(3),
    ADD COLUMN "invoicedAt" TIMESTAMP(3),
    ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateIndex
-- Two queries finance actually runs: work invoiced and not yet paid, and work
-- authorised but not yet started.
CREATE INDEX "maintenance_jobs_companyId_invoicedAt_idx"
    ON "maintenance_jobs"("companyId", "invoicedAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_purchaseOrderAt_idx"
    ON "maintenance_jobs"("companyId", "purchaseOrderAt");

-- AlterEnum
-- Appended, never inserted. PostgreSQL stores enum values in order, Prisma
-- compares them as an ordered list in the drift guard, and inserting a value
-- in the middle would mean dropping and recreating the type — which rewrites
-- every row that uses it for the sake of tidiness.
ALTER TYPE "MaintenanceEventType" ADD VALUE 'COMMERCIAL_CHANGED';
