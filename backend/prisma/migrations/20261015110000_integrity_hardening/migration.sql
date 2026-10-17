-- Integrity hardening for collection provenance, invoice billing, disbursement
-- references, COD settlement retries, and fleet service-record retries.
-- This migration deliberately stops before changing data if historical rows
-- violate the new invariants. Operators must reconcile those rows explicitly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "waybills"
    WHERE "sourceCollectionId" IS NOT NULL
    GROUP BY "sourceCollectionId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate waybill sourceCollectionId values exist; reconcile them before applying integrity hardening';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "waybills" w
    LEFT JOIN "collections" c ON c."id" = w."sourceCollectionId"
    WHERE w."sourceCollectionId" IS NOT NULL
      AND (c."id" IS NULL OR c."companyId" <> w."companyId")
  ) THEN
    RAISE EXCEPTION 'Waybill sourceCollectionId contains an orphan or cross-tenant reference; reconcile it before applying integrity hardening';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "invoice_items"
    WHERE "waybillId" IS NOT NULL
    GROUP BY "waybillId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Waybills appear on multiple invoice items; reconcile rebilling/duplicate lines before applying invoice uniqueness';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "invoice_items" ii
    JOIN "invoices" i ON i."id" = ii."invoiceId"
    JOIN "waybills" w ON w."id" = ii."waybillId"
    WHERE ii."waybillId" IS NOT NULL
      AND i."companyId" <> w."companyId"
  ) THEN
    RAISE EXCEPTION 'Invoice items link waybills across companies; reconcile tenant ownership before applying invoice integrity hardening';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "disbursements" d
    LEFT JOIN "invoices" i ON i."id" = d."invoiceId"
    WHERE d."invoiceId" IS NOT NULL
      AND (i."id" IS NULL OR i."companyId" <> d."companyId")
  ) THEN
    RAISE EXCEPTION 'Disbursement invoiceId contains an orphan or cross-tenant reference; reconcile it before adding the invoice foreign key';
  END IF;
END $$;

-- Legacy SSO secrets were stored as plaintext. Remove them from the database;
-- admins must re-enter provider secrets after configuring the stable server key.
UPDATE "sso_connections"
  SET "clientSecret" = NULL
  WHERE "clientSecret" IS NOT NULL
    AND "clientSecret" NOT LIKE 'enc:v1:%';

-- Enforce one collection -> at most one source waybill and preserve provenance.
DROP INDEX "waybills_sourceCollectionId_idx";
CREATE UNIQUE INDEX "waybills_sourceCollectionId_key"
  ON "waybills"("sourceCollectionId");
ALTER TABLE "waybills"
  ADD CONSTRAINT "waybills_sourceCollectionId_fkey"
  FOREIGN KEY ("sourceCollectionId") REFERENCES "collections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A waybill is invoiced once; adjustments/rebilling must be represented with
-- credit/debit notes rather than a second invoice line.
CREATE UNIQUE INDEX "invoice_items_waybillId_key"
  ON "invoice_items"("waybillId");

-- Enforce tenant equality in the optional reconciliation invoice link. A
-- RESTRICT delete policy preserves the disbursement's audit trail and requires
-- operators to unlink/reconcile references before deleting the invoice.
CREATE UNIQUE INDEX "invoices_id_companyId_key"
  ON "invoices"("id", "companyId");
CREATE INDEX "disbursements_invoiceId_idx" ON "disbursements"("invoiceId");
ALTER TABLE "disbursements"
  ADD CONSTRAINT "disbursements_invoiceId_companyId_fkey"
  FOREIGN KEY ("invoiceId", "companyId") REFERENCES "invoices"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A stable key is now required for each service record. Existing records get a
-- deterministic legacy key; no rows are discarded or rewritten otherwise.
ALTER TABLE "vehicle_services" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "vehicle_services" ADD COLUMN "requestFingerprint" TEXT;
UPDATE "vehicle_services"
  SET "idempotencyKey" = 'legacy:' || "id"
  WHERE "idempotencyKey" IS NULL;
ALTER TABLE "vehicle_services" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "vehicle_services_driverId_idempotencyKey_key"
  ON "vehicle_services"("driverId", "idempotencyKey");

-- Only manual SETTLEMENT rows use an idempotency key. Nullable fields keep
-- existing collection/adjustment rows and historical settlements intact.
ALTER TABLE "cod_transactions" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "cod_transactions" ADD COLUMN "requestFingerprint" TEXT;
CREATE UNIQUE INDEX "cod_transactions_walletId_idempotencyKey_key"
  ON "cod_transactions"("walletId", "idempotencyKey");
