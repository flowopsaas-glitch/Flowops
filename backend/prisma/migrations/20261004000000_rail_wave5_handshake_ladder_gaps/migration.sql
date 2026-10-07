-- Rail Wave 5: Annexure 28 escalation-ladder corrections (gaps G-1 and G-2)
-- and the two mandated deviation capture fields that had no counterpart
-- (gaps G-4 and G-5).
--
-- Statements: 1 CREATE TYPE, 1 DROP TYPE, 4 ALTER TABLE (3 for the enum swap,
-- 3 ... ADD COLUMN). No table is created, dropped or renamed.
--
-- ── Why this migration is NOT additive ──────────────────────────────────────
--
-- It drops and recreates the "EscalationStage" enum. PostgreSQL cannot reorder
-- enum values in place, and the obvious one-liner —
--
--     ALTER TYPE "EscalationStage" ADD VALUE 'HEAD_NSPO_72H';
--
-- appends the new value AFTER 'REGULATOR_DISPUTE'. That is wrong twice over.
-- It reads as though the Regulator were an earlier stage than the Head of
-- Network Service Planning and Operations, which inverts the ladder; and CI's
-- drift guard rejects it, because Prisma compares PostgreSQL enum values as an
-- ordered list rather than as a set.
--
-- ── Data safety ─────────────────────────────────────────────────────────────
--
-- Every previous value ('NONE', 'LIAISON_MANAGER_24H', 'HEAD_LIAISON_48H',
-- 'ROUTE_LOGISTICS_FORUM', 'REGULATOR_DISPUTE') exists in the new type, so the
-- ::text:: cast cannot fail and no row is lost or rewritten in meaning.
--
-- The column is NOT NULL with DEFAULT 'NONE'. Postgres will not silently carry
-- that default across a type change in every version, so it is dropped and
-- re-set explicitly around the swap rather than left to chance.
--
-- Note for the operator: rows sitting at ROUTE_LOGISTICS_FORUM keep that value,
-- but its meaning changes. Under the old ladder it meant "72h elapsed"; under
-- the corrected ladder it means "96h elapsed and still unresolved". Any such
-- rows were escalated a day early. They are left as-is rather than silently
-- re-graded — correcting them is a judgement call about real items, not a
-- migration concern.
--
-- ── Provenance ──────────────────────────────────────────────────────────────
--
-- As in the earlier rail waves, the engine binaries (binaries.prisma.sh) were
-- unreachable from the authoring sandbox, so this file was rendered from
-- schema.prisma's datamodel by the renderer first calibrated against Prisma's
-- own output. CI's "Verify migrations match the schema (drift guard)" step,
-- which uses the real engine, remains the authority.

-- 1. Rebuild the ladder with the 72h rung in its correct position.
ALTER TYPE "EscalationStage" RENAME TO "EscalationStage_old";

CREATE TYPE "EscalationStage" AS ENUM (
  'NONE',
  'LIAISON_MANAGER_24H',
  'HEAD_LIAISON_48H',
  'HEAD_NSPO_72H',
  'ROUTE_LOGISTICS_FORUM',
  'REGULATOR_DISPUTE'
);

ALTER TABLE "rail_handshake_deviations"
  ALTER COLUMN "escalationStage" DROP DEFAULT;

ALTER TABLE "rail_handshake_deviations"
  ALTER COLUMN "escalationStage" TYPE "EscalationStage"
  USING ("escalationStage"::text::"EscalationStage");

ALTER TABLE "rail_handshake_deviations"
  ALTER COLUMN "escalationStage" SET DEFAULT 'NONE';

DROP TYPE "EscalationStage_old";

-- 2. NS §6.6.1.3.3 mandates ten capture fields per deviation. These two —
--    "other Train Paths impacted or delayed" and "SLA KPIs impacted" — had no
--    counterpart at all. Both are evidence obligations on the day-of-operation
--    reconciliation, so their absence is a completeness gap, not a cosmetic one.
ALTER TABLE "rail_handshake_deviations" ADD COLUMN IF NOT EXISTS "otherTrainPathsImpacted" TEXT;
ALTER TABLE "rail_handshake_deviations" ADD COLUMN IF NOT EXISTS "slaKpisImpacted" TEXT;

-- 3. Annexure 28: escalated to the Head of Network Service Planning and
--    Operations at 72h, who must resolve within 96h of the window closing.
--    Expiry of this deadline is what refers the item to the Route Logistics
--    Forum; it has no counterpart in the old ladder.
ALTER TABLE "rail_handshake_deviations" ADD COLUMN IF NOT EXISTS "resolveByAt" TIMESTAMP(3);
