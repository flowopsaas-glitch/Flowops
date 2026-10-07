-- Driver dispatch-compliance fields
--
-- 7 ALTER TABLE ... ADD COLUMN statements. STRICTLY ADDITIVE: every new column
-- is nullable except `complianceHold`, which is NOT NULL with a DEFAULT and so
-- backfills existing rows atomically. No DROP, no ALTER COLUMN, no
-- UPDATE/DELETE/INSERT — running this migration cannot rewrite or lose data.
--
-- Why: dispatch, manual assignment and route creation all need one compliance
-- policy (DriverComplianceService). Until now the dates that policy has to
-- check (licence, insurance, background check, operational hold) had nowhere to
-- live in the datamodel, so every code path either skipped the check or would
-- have read a column that does not exist.
--
-- Provenance: like 20261002070000_rail_wave4_*, this file was rendered from
-- schema.prisma by hand because the engine binaries (binaries.prisma.sh) are
-- unreachable from the authoring sandbox. Prisma emits nullable DateTime as
-- TIMESTAMP(3) and `Boolean @default(false)` as BOOLEAN NOT NULL DEFAULT false.
-- CI's "Verify migrations match the schema (drift guard)" step, which uses the
-- real engine, remains the authority.
--
-- Rollback: DROP COLUMN for the five optional fields (data loss is limited to
-- compliance evidence captured after this migration); the three added columns
-- hold no data before it runs.

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "licenseExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "insuranceExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "backgroundCheckExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "complianceHold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "complianceHoldReason" TEXT;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "complianceHoldAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "complianceHoldBy" TEXT;
