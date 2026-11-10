-- Corridor technical envelope, loaded from Network Statement Volume 4 Chapter 2.
--
-- For two years the six corridors carried their names and nothing else: gauge,
-- electrification, axle load and train length were all NULL with dataStatus
-- SOURCE_PENDING, because Chapter 2 of the Network Statement had never been
-- supplied to this repository. It has now been supplied (TRIM Network Statement
-- 18 September 2026, 203 pages) and §2.8–2.13 give the envelope for all six
-- corridors. This migration carries the two columns that envelope needs.
--
-- 1. envelopeExceptions
--    Chapter 2 does not give one number per corridor. It gives a GENERAL figure
--    and then departs from it on named sections: North runs 20 t per axle but
--    26 t from Blackhill via Ogies and Ermelo to Richards Bay and Trichardt to
--    Ermelo, and only 18.5 t Empangeni–Nkwalini (§2.8.1.6); Cape is
--    "predominantly" 1 065 mm but 610 mm on the Humewood Road–Gamtoos–Avontuur
--    and Patensie branches (§2.11.1.3). Those departures are safety numbers.
--    Flattening them into the general column would let an operator plan 26 t on
--    an 18.5 t section, so they get a typed, validated home of their own instead
--    of living only in prose.
--
-- 2. RailDataStatus.PARTIAL
--    The envelope is now loaded but not complete. §2.x.1.4 defers the vehicle
--    (loading) gauge to Annexures 2 and 3, and §2.x.1.7 the line gradients to
--    Annexure 5 — none of which were supplied. So no corridor can honestly be
--    VERIFIED, and leaving them SOURCE_PENDING would understate what is now
--    known. PARTIAL says exactly that: some of it is real and cited, the rest is
--    not. It is appended to the enum rather than inserted, following the
--    precedent set for MaintenanceEventType — PostgreSQL stores enum values in
--    order, Prisma's drift guard compares them as an ordered list, and inserting
--    would mean dropping and recreating the type and rewriting every row that
--    uses it.
--
-- Both changes are additive and nullable: existing rows keep their current
-- status, and nothing that reads these tables changes behaviour.
--
-- On the enum: ALTER TYPE ... ADD VALUE runs inside Prisma's migration
-- transaction. That is only legal from PostgreSQL 12 onwards, and only when
-- the new value is not used in the same transaction — both of which hold here
-- (the project runs postgres:16-alpine, and the value is added, not read).
-- The guard makes the statement re-runnable rather than aborting on a second
-- pass over the same database.

ALTER TABLE "rail_corridor_nodes" ADD COLUMN IF NOT EXISTS "envelopeExceptions" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'RailDataStatus' AND e.enumlabel = 'PARTIAL'
  ) THEN
    ALTER TYPE "RailDataStatus" ADD VALUE 'PARTIAL';
  END IF;
END $$;
