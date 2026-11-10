-- General Average.
--
-- Background (this is maritime law, not a product idea):
--
-- When extraordinary expenditure is incurred, or property sacrificed, to save
-- a ship and its cargo from a common danger, the loss is shared proportionally
-- by everyone whose property survived it — hull, freight and every cargo
-- interest on the voyage. A cargo owner whose goods arrived undamaged still
-- owes a contribution.
--
-- The operational consequence, and the reason this is modelled at all: the
-- shipowner holds a lien over the cargo, and cargo is not released until the
-- cargo interest provides GA security. A forwarder who releases cargo without
-- security is personally liable for the contribution. That is a liability the
-- software can prevent, and preventing it is worth more than reporting on it.
--
-- Design notes:
--   * Contributors are keyed to ShipmentFile, so GA hangs off data the tenant
--     already has — no parallel cargo register to keep in step.
--   * contributoryValue is STORED, not derived. The adjuster may assess a
--     different figure and the two must be reconcilable side by side.
--   * securityLodgedAt is the release gate. Null means do not release.
--   * Money is Float to match the rest of the schema (see ShipmentCharge).
--     GA adjustments run to many decimal places on percentages; the amounts
--     are advisory until the adjuster's award lands, and the award is entered
--     as given rather than recomputed.
--
-- IF NOT EXISTS throughout so this is re-runnable against a database that
-- carries part of it from an earlier partial rollout.

CREATE TYPE "GeneralAverageStatus" AS ENUM (
  'DECLARED', 'SECURING', 'SECURED', 'ADJUSTED', 'SETTLED', 'CLOSED'
);

CREATE TYPE "GeneralAverageSecurity" AS ENUM (
  'AVERAGE_BOND', 'INSURER_GUARANTEE', 'CASH_DEPOSIT'
);

CREATE TYPE "GeneralAverageValueBasis" AS ENUM (
  'CIF', 'DECLARED', 'ADJUSTED'
);

CREATE TABLE IF NOT EXISTS "general_average_events" (
  "id"              TEXT        NOT NULL,
  "vesselName"      TEXT        NOT NULL,
  "vesselImo"       TEXT,
  "vesselMmsi"      TEXT,
  "voyageNumber"    TEXT,
  "occurredAt"      TIMESTAMP(3) NOT NULL,
  "portOfRefuge"    TEXT,
  "nature"          TEXT        NOT NULL,
  "declaredBy"      TEXT,
  "declaredAt"      TIMESTAMP(3),
  "adjusterName"    TEXT,
  "adjusterRef"     TEXT,
  "totalExpenditure" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalSacrifice"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency"        TEXT        NOT NULL DEFAULT 'USD',
  "status"          "GeneralAverageStatus" NOT NULL DEFAULT 'DECLARED',
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "companyId"       TEXT        NOT NULL,

  CONSTRAINT "general_average_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "general_average_contributors" (
  "id"                TEXT NOT NULL,
  "eventId"           TEXT NOT NULL,
  "shipmentFileId"    TEXT NOT NULL,
  "contributoryValue" DOUBLE PRECISION NOT NULL,
  "valueBasis"        "GeneralAverageValueBasis" NOT NULL DEFAULT 'DECLARED',
  "adjustedValue"     DOUBLE PRECISION,
  "sharePct"          DOUBLE PRECISION,
  "estimatedContribution" DOUBLE PRECISION,
  "assessedContribution"  DOUBLE PRECISION,
  "securityType"      "GeneralAverageSecurity",
  "securityAmount"    DOUBLE PRECISION,
  "securityRef"       TEXT,
  "securityLodgedAt"  TIMESTAMP(3),
  "releasedAt"        TIMESTAMP(3),
  "releasedBy"        TEXT,
  "balanceDue"        DOUBLE PRECISION,
  "settledAt"         TIMESTAMP(3),
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "companyId"         TEXT NOT NULL,

  CONSTRAINT "general_average_contributors_pkey" PRIMARY KEY ("id")
);

-- One contributor row per cargo interest per event. The natural key, not an
-- afterthought: a duplicated contributor would double-count a share.
CREATE UNIQUE INDEX IF NOT EXISTS "general_average_contributors_eventId_shipmentFileId_key"
  ON "general_average_contributors"("eventId", "shipmentFileId");

CREATE INDEX IF NOT EXISTS "general_average_events_companyId_idx"
  ON "general_average_events"("companyId");
CREATE INDEX IF NOT EXISTS "general_average_events_companyId_status_idx"
  ON "general_average_events"("companyId", "status");
CREATE INDEX IF NOT EXISTS "general_average_contributors_eventId_idx"
  ON "general_average_contributors"("eventId");
CREATE INDEX IF NOT EXISTS "general_average_contributors_shipmentFileId_idx"
  ON "general_average_contributors"("shipmentFileId");
CREATE INDEX IF NOT EXISTS "general_average_contributors_companyId_idx"
  ON "general_average_contributors"("companyId");

-- Tenant isolation: contributing rows are tenant data.
ALTER TABLE "general_average_events"
  ADD CONSTRAINT "general_average_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "general_average_contributors"
  ADD CONSTRAINT "general_average_contributors_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "general_average_contributors"
  ADD CONSTRAINT "general_average_contributors_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "general_average_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "general_average_contributors"
  ADD CONSTRAINT "general_average_contributors_shipmentFileId_fkey"
  FOREIGN KEY ("shipmentFileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation for the new tables (same shape as the RLS migration;
-- kept here so fresh-database replay creates the table before its policy).
--
-- This is not boilerplate. A general average event names the vessel, the
-- casualty and the port of refuge — commercially sensitive, and read by
-- cargo interests who are not the tenant. Leaking one tenant's GA exposure
-- to another is a confidentiality breach, not a display bug.
ALTER TABLE "general_average_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "general_average_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "general_average_events"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "general_average_contributors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "general_average_contributors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "general_average_contributors"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
