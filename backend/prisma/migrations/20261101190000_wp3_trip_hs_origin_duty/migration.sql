-- WP3 Stage 5: HS code, origin status, duty ESTIMATED vs ACTUAL.
-- Additive only: adds columns to the `trips` table and a new enum.
-- No changes to existing table semantics. No column is dropped or renamed.

-- ── New enums ──────────────────────────────────────────────────────────────
CREATE TYPE "OriginStatus" AS ENUM ('PREFERENTIAL', 'NON_PREFERENTIAL', 'UNKNOWN');
CREATE TYPE "TripDutyProvenance" AS ENUM ('ESTIMATED', 'ACTUAL');

-- ── Trip: HS code, origin status, duty columns ─────────────────────────────
ALTER TABLE "trips" ADD COLUMN "hsCode" TEXT;
ALTER TABLE "trips" ADD COLUMN "originStatus" "OriginStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "trips" ADD COLUMN "certificateOfOriginRef" TEXT;
ALTER TABLE "trips" ADD COLUMN "dutyEstimated" DOUBLE PRECISION;
ALTER TABLE "trips" ADD COLUMN "estimateSource" TEXT;
ALTER TABLE "trips" ADD COLUMN "estimateVersion" TEXT;
ALTER TABLE "trips" ADD COLUMN "estimatedAt" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "dutyActual" DOUBLE PRECISION;
ALTER TABLE "trips" ADD COLUMN "declarationRef" TEXT;
ALTER TABLE "trips" ADD COLUMN "capturedBy" TEXT;
ALTER TABLE "trips" ADD COLUMN "capturedAt" TIMESTAMP(3);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX "trips_originStatus_idx" ON "trips"("originStatus");
