-- Rail networks and a configurable escalation ladder.
--
-- Why this exists (asked as a plain question: "if I set up an international
-- client, would the Transnet pagers also show?").
--
-- They would. The escalation ladder was `enum EscalationStage`, whose values
-- name Transnet posts — LIAISON_MANAGER_24H, HEAD_NSPO_72H — and every rail
-- tenant saw them regardless of which country they operated in. A client in
-- Europe would watch their unresolved deviations "escalate to the TRIM Head of
-- Access Seeker Service", a job that does not exist in their market, on a
-- clock set by Annexure 28 rather than by their own access contract.
--
-- Rail is not one market. Who owns the track, who you apply to for a train
-- path, what the dispute process is called and how long each rung gets are all
-- set by the network. Transnet publishes a Network Statement with a
-- 24/48/96-hour ladder; a European operator works under Directive 2012/34/EU
-- against a different infrastructure manager with different deadlines. The
-- ladder is data about a network, not a property of the platform.
--
-- Two models:
--
--   rail_networks          the infrastructure manager. A row with a NULL
--                          companyId is a platform preset every tenant may
--                          use; one with a companyId is tenant-defined.
--   rail_escalation_rungs  one rung of that network's ladder: the elapsed
--                          hours at which it applies, and who holds the item.
--
-- Backwards compatibility. rail_handshake_deviations.escalationStage is kept
-- and indexed. It is now a projection written from the rung's legacyStage, so
-- the existing queries and the ~790 lines of handshake tests keep working
-- untouched. The rung is the truth; rungs with no Transnet counterpart leave
-- the projection NULL and callers must read the rung.
--
-- RLS note, and this one matters. A platform preset has companyId IS NULL.
-- The existing app_tenant_guard() only ever compares "companyId" to
-- app_tenant(), so a NULL row matches for nobody the moment a tenant context
-- is set. That is not hypothetical: rail_schedule_imports already stores
-- shared rows with companyId NULL behind that guard, and they are visible
-- today only because the service reads them with a bare query rather than
-- through withTenant(). Wrapping that read in withTenant() — the obvious
-- "improvement" — would silently make every shared timetable disappear.
--
-- Rather than inherit that trap, this migration adds
-- app_tenant_guard_shared(): tenant rows scoped as before, plus rows with a
-- NULL companyId visible to everyone, which is what a preset means. When
-- app.rls_strict is eventually switched on, presets keep working.
--
-- The ladder seeded below reproduces the previous hardcoded behaviour exactly
-- — same thresholds, same job titles, same "never auto-lodge with the
-- Regulator" rule. No existing report changes rung as a result of this
-- migration.

CREATE TABLE IF NOT EXISTS "rail_networks" (
  "id"          TEXT        NOT NULL,
  "code"        TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "shortName"   TEXT,
  "country"     TEXT        NOT NULL DEFAULT 'ZA',
  "currency"    TEXT        NOT NULL DEFAULT 'ZAR',
  "companyId"   TEXT,
  "isDefault"   BOOLEAN     NOT NULL DEFAULT false,
  "networkStatementRef" TEXT,
  "resolveByHours" INTEGER NOT NULL DEFAULT 96,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rail_networks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rail_networks_code_key" ON "rail_networks"("code");
CREATE INDEX IF NOT EXISTS "rail_networks_companyId_idx" ON "rail_networks"("companyId");

CREATE TABLE IF NOT EXISTS "rail_escalation_rungs" (
  "id"           TEXT        NOT NULL,
  "networkId"    TEXT        NOT NULL,
  "code"         TEXT        NOT NULL,
  "title"        TEXT        NOT NULL,
  "role"         TEXT,
  "afterHours"   INTEGER     NOT NULL,
  "ordinal"      INTEGER     NOT NULL,
  "isManualOnly" BOOLEAN     NOT NULL DEFAULT false,
  "isTerminal"   BOOLEAN     NOT NULL DEFAULT false,
  "legacyStage"  "EscalationStage",
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rail_escalation_rungs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rail_escalation_rungs_networkId_fkey"
    FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "rail_escalation_rungs_networkId_code_key"
  ON "rail_escalation_rungs"("networkId", "code");
CREATE INDEX IF NOT EXISTS "rail_escalation_rungs_networkId_afterHours_idx"
  ON "rail_escalation_rungs"("networkId", "afterHours");

-- A row with a NULL companyId is shared platform data, not unowned data.
CREATE OR REPLACE FUNCTION app_tenant_guard_shared("companyId" TEXT) RETURNS BOOLEAN
STABLE
LANGUAGE sql
AS $$
  SELECT "companyId" IS NULL
      OR "companyId" = app_tenant()
      OR (
        app_tenant() IS NULL
        AND NOT COALESCE(current_setting('app.rls_strict', true), 'off') IN ('on', 'true', '1')
      )
$$;

-- rail_networks: presets (NULL companyId) visible to all, tenant rows to their tenant.
ALTER TABLE "rail_networks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rail_networks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "rail_networks"
  USING (app_tenant_guard_shared("companyId"))
  WITH CHECK (app_tenant_guard_shared("companyId"));

-- rungs carry no companyId of their own; they inherit the network's visibility.
ALTER TABLE "rail_escalation_rungs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rail_escalation_rungs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "rail_escalation_rungs"
  USING (EXISTS (
    SELECT 1 FROM "rail_networks" n
    WHERE n."id" = "rail_escalation_rungs"."networkId"
      AND app_tenant_guard_shared(n."companyId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "rail_networks" n
    WHERE n."id" = "rail_escalation_rungs"."networkId"
      AND app_tenant_guard_shared(n."companyId")
  ));

-- Link reports to the network they were raised against. Nullable: reports
-- created before networks existed keep NULL and fall back to the default.
ALTER TABLE "rail_handshake_reports"
  ADD COLUMN IF NOT EXISTS "networkId" TEXT;

-- The rung is the truth; escalationStage becomes a projection of it.
ALTER TABLE "rail_handshake_deviations"
  ADD COLUMN IF NOT EXISTS "escalationRungId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rail_handshake_reports_networkId_fkey'
  ) THEN
    ALTER TABLE "rail_handshake_reports"
      ADD CONSTRAINT "rail_handshake_reports_networkId_fkey"
      FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rail_handshake_deviations_escalationRungId_fkey'
  ) THEN
    ALTER TABLE "rail_handshake_deviations"
      ADD CONSTRAINT "rail_handshake_deviations_escalationRungId_fkey"
      FOREIGN KEY ("escalationRungId") REFERENCES "rail_escalation_rungs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rail_handshake_reports_networkId_idx"
  ON "rail_handshake_reports"("networkId");
CREATE INDEX IF NOT EXISTS "rail_handshake_deviations_escalationRungId_idx"
  ON "rail_handshake_deviations"("escalationRungId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Transnet, reproducing the previous hardcoded ladder exactly.
--
-- afterHours is the elapsed-hours threshold at or above which the rung
-- applies, so these values are chosen to reproduce the old ladder precisely:
--
--   old: hours <= 24  -> LIAISON_MANAGER_24H   new: afterHours 0
--   old: hours <= 48  -> HEAD_LIAISON_48H      new: afterHours 24
--   old: hours <= 96  -> HEAD_NSPO_72H         new: afterHours 48
--   old: hours >  96  -> ROUTE_LOGISTICS_FORUM new: afterHours 96
--
-- Two properties the old enum carried in prose and which are now enforced by
-- the resolver:
--   * REGULATOR_DISPUTE is manual-only. Lodging with the Regulator is a
--     decision a person makes; the clock must never make it for them.
--   * The Forum is not reached until 96h. The Head of NSP&O is entitled to
--     the full 96 hours to resolve before anyone refers the item onward.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "rail_networks" ("id", "code", "name", "shortName", "country", "currency", "companyId", "isDefault", "networkStatementRef", "resolveByHours", "updatedAt")
VALUES ('net-transnet', 'transnet', 'Transnet Freight Rail', 'TRIM', 'ZA', 'ZAR', NULL, true,
        'Network Statement Volume 4 — September 2026', 96, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rail_escalation_rungs" ("id", "networkId", "code", "title", "role", "afterHours", "ordinal", "isManualOnly", "isTerminal", "legacyStage", "updatedAt")
VALUES
  ('rung-tfr-liaison',  'net-transnet', 'liaison-manager',   'Access Seeker Liaison Manager',                 'TRIM Access Seeker Liaison Manager',                 0,  10, false, false, 'LIAISON_MANAGER_24H'::"EscalationStage", CURRENT_TIMESTAMP),
  ('rung-tfr-head',     'net-transnet', 'head-access-seeker','Head of Access Seeker Service',                 'TRIM Head of Access Seeker Service',                24,  20, false, false, 'HEAD_LIAISON_48H'::"EscalationStage",    CURRENT_TIMESTAMP),
  ('rung-tfr-nspo',     'net-transnet', 'head-nspo',         'Head of Network Service Planning and Operations','TRIM Head of Network Service Planning and Operations', 48, 30, false, false, 'HEAD_NSPO_72H'::"EscalationStage",       CURRENT_TIMESTAMP),
  ('rung-tfr-forum',    'net-transnet', 'route-logistics-forum','Route Logistics Forum',                      'Route Logistics Forum',                             96,  40, false, true,  'ROUTE_LOGISTICS_FORUM'::"EscalationStage", CURRENT_TIMESTAMP),
  ('rung-tfr-regulator','net-transnet', 'regulator-dispute', 'Dispute with the Regulator',                    'Transport Economic Regulator (Rail)',               96,  50, true,  true,  'REGULATOR_DISPUTE'::"EscalationStage",    CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Backfill: rows predating the rung column carry a stage but no rung.
--
-- Without this, the first read of every legacy report would look like a move —
-- the stored rung is NULL and the resolved one is not — and would rewrite each
-- row and write an audit entry for an escalation that never happened. The
-- resolver deliberately treats a NULL rung as "not a move" for exactly this
-- reason, but the column should still be correct in the database: join on the
-- rung's legacyStage projection, which is a 1:1 mapping for Transnet.
UPDATE "rail_handshake_deviations" d
SET "escalationRungId" = r."id"
FROM "rail_escalation_rungs" r
WHERE d."escalationRungId" IS NULL
  AND r."legacyStage" = d."escalationStage"
  AND r."networkId" = 'net-transnet'
  AND d."escalationStage" <> 'NONE';
