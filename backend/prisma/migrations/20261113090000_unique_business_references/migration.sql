-- ─────────────────────────────────────────────────────────────────────────────
-- Unique constraints on three business references
-- ─────────────────────────────────────────────────────────────────────────────
--
--   whatsapp_messages."wabaMessageId"
--   manifests."code"                  (company-scoped: companyId, code)
--   courier_orders."reference"        (company-scoped: companyId, reference)
--
-- WHY THE DE-DUPLICATION COMES FIRST
-- ----------------------------------
-- CREATE UNIQUE INDEX fails outright if a single duplicate exists, and all
-- three of these columns have been unenforced since the tables were created.
-- A migration that only adds the index would therefore abort mid-deploy on
-- the first database that already has a duplicate — which is exactly the
-- database that most needs the constraint.
--
-- So each index is preceded by a deterministic de-duplication. "Deterministic"
-- means the surviving row is chosen by an explicit ORDER BY (oldest first, id
-- as the tiebreak), not by whatever order the planner happens to return: two
-- runs of this migration on two copies of the same data make the same choice.
--
-- WHAT THE DE-DUPLICATION COSTS
-- -----------------------------
--   wabaMessageId  Nulled on the redundant rows. The column is nullable and
--                  is only Meta's provider id — the message row itself, its
--                  content, thread and timestamps are untouched. Nothing is
--                  lost; only the duplicate pointer to the same Meta message
--                  goes, which is what the constraint is for.
--
--   code/          These are NOT NULL, so they cannot be nulled. The redundant
--   reference      rows get a "-dup<N>" suffix, keeping the oldest row's
--                  original value intact. Both rows survive; the codes are
--                  merely made distinguishable, and the suffix is greppable
--                  so the affected rows can be reviewed afterwards.
--
-- Every step is idempotent: run twice and the second pass changes nothing,
-- because after the first pass no duplicate groups remain.
--
-- BEFORE RUNNING THIS ANYWHERE WITH REAL DATA
-- -------------------------------------------
-- Run the read-only pre-flight first and read what it reports:
--
--   node scripts/duplicate-reference-check.mjs
--
-- It lists every duplicate group this migration would touch. This migration
-- changes rows; that one does not.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. whatsapp_messages."wabaMessageId" ──────────────────────────────────────
-- Meta retries a webhook until it receives a 200 and does not promise
-- exactly-once; the retry carries the same waba message id. Duplicates here
-- are not hypothetical — one customer message was stored twice and, because
-- the AI inbox sits downstream, produced two collections and two invoices for
-- a single pickup.

DO $$
DECLARE
  n_groups bigint;
  n_rows   bigint;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(c - 1), 0)
    INTO n_groups, n_rows
    FROM (
      SELECT COUNT(*) AS c
        FROM "whatsapp_messages"
       WHERE "wabaMessageId" IS NOT NULL
       GROUP BY "wabaMessageId"
      HAVING COUNT(*) > 1
    ) g;

  IF n_groups > 0 THEN
    RAISE NOTICE 'whatsapp_messages: % duplicate wabaMessageId group(s); nulling the provider id on % redundant row(s) (message content is preserved).', n_groups, n_rows;
  ELSE
    RAISE NOTICE 'whatsapp_messages: no duplicate wabaMessageId values.';
  END IF;
END $$;

UPDATE "whatsapp_messages" AS m
   SET "wabaMessageId" = NULL
 WHERE m."id" IN (
   SELECT d."id"
     FROM (
       SELECT "id",
              ROW_NUMBER() OVER (
                PARTITION BY "wabaMessageId"
                ORDER BY "sentAt" ASC, "id" ASC
              ) AS rn
         FROM "whatsapp_messages"
        WHERE "wabaMessageId" IS NOT NULL
     ) AS d
    WHERE d.rn > 1
);

-- ── 2. manifests."code" ───────────────────────────────────────────────────────
-- Per-tenant sequence (MAN-00001). The allocation holds a transaction-scoped
-- advisory lock, so two concurrent creates cannot collide — but the code is
-- COUNT()+1, so deleting a manifest lowers the count and reissues a code that
-- is already on a live row.

DO $$
DECLARE
  n_groups bigint;
BEGIN
  SELECT COUNT(*) INTO n_groups
    FROM (
      SELECT 1
        FROM "manifests"
       GROUP BY "companyId", "code"
      HAVING COUNT(*) > 1
    ) g;

  IF n_groups > 0 THEN
    RAISE NOTICE 'manifests: % duplicate (companyId, code) group(s); suffixing the redundant rows with -dup<N>, oldest row keeps its code.', n_groups;
  ELSE
    RAISE NOTICE 'manifests: no duplicate (companyId, code) values.';
  END IF;
END $$;

UPDATE "manifests" AS m
   SET "code" = m."code" || '-dup' || d.rn::text
  FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "companyId", "code"
             ORDER BY "createdAt" ASC, "id" ASC
           ) AS rn
      FROM "manifests"
  ) AS d
 WHERE m."id" = d."id"
   AND d.rn > 1;

-- ── 3. courier_orders."reference" ─────────────────────────────────────────────
-- Per-tenant, per-year sequence (ORD-2026-00001), same generator shape and the
-- same residual gap as manifests.

DO $$
DECLARE
  n_groups bigint;
BEGIN
  SELECT COUNT(*) INTO n_groups
    FROM (
      SELECT 1
        FROM "courier_orders"
       GROUP BY "companyId", "reference"
      HAVING COUNT(*) > 1
    ) g;

  IF n_groups > 0 THEN
    RAISE NOTICE 'courier_orders: % duplicate (companyId, reference) group(s); suffixing the redundant rows with -dup<N>, oldest row keeps its reference.', n_groups;
  ELSE
    RAISE NOTICE 'courier_orders: no duplicate (companyId, reference) values.';
  END IF;
END $$;

UPDATE "courier_orders" AS c
   SET "reference" = c."reference" || '-dup' || d.rn::text
  FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "companyId", "reference"
             ORDER BY "createdAt" ASC, "id" ASC
           ) AS rn
      FROM "courier_orders"
  ) AS d
 WHERE c."id" = d."id"
   AND d.rn > 1;

-- ── The constraints themselves ────────────────────────────────────────────────
-- Index names follow Prisma's convention: <mapped table>_<field>_<field>_key.
-- Tenant-scoped on the two sequences on purpose: company A's MAN-00001 and
-- company B's MAN-00001 are both legitimate, so a global unique on "code"
-- would reject valid data rather than protect it.

CREATE UNIQUE INDEX "whatsapp_messages_wabaMessageId_key" ON "whatsapp_messages"("wabaMessageId");

CREATE UNIQUE INDEX "manifests_companyId_code_key" ON "manifests"("companyId", "code");

CREATE UNIQUE INDEX "courier_orders_companyId_reference_key" ON "courier_orders"("companyId", "reference");
