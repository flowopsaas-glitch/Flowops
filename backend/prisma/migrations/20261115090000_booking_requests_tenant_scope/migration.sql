-- booking_requests: give every row a tenant of its own.
--
-- The table shipped in the init migration carrying only `linkId` -> booking_portal_links.
-- A request therefore had no tenant column of its own, which had two consequences
-- that were invisible while nothing read the table (no code ever did — the Prisma
-- model had zero references across src/):
--
--   1. The 20261012210000_rls_tenant_isolation sweep could not cover it. Every
--      other tenant table got ENABLE/FORCE ROW LEVEL SECURITY plus a
--      tenant_isolation policy testing app_tenant_guard("companyId"); this one
--      was skipped, because there was no companyId for the policy to test.
--   2. Any future lookup by id would be unscoped. Reads through the link are
--      safe, but a `findUnique({ where: { id } })` on a row with no tenant of
--      its own resolves for every company.
--
-- Both become live the moment a controller exists, so the column lands before
-- the code, not after.
--
-- companyId is copied from the link rather than invented: the link is the
-- authority, and the service derives the value from it at write time instead of
-- trusting a request body. The backfill is a no-op on any dataset where
-- booking_requests is empty. A request cannot outlive its link (ON DELETE
-- CASCADE on booking_requests_linkId_fkey), so there is no orphan case.

ALTER TABLE "booking_requests" ADD COLUMN "companyId" TEXT;

UPDATE "booking_requests" br
   SET "companyId" = l."companyId"
  FROM "booking_portal_links" l
 WHERE l."id" = br."linkId";

-- Refuse to continue with NULL tenants. A NULL here is worse than a failure:
-- the row would have no owner, RLS could not express it, and it would sit
-- unreadable rather than visibly broken.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "booking_requests" WHERE "companyId" IS NULL) THEN
    RAISE EXCEPTION
      'booking_requests: % row(s) could not be backfilled — no parent link',
      (SELECT count(*) FROM "booking_requests" WHERE "companyId" IS NULL);
  END IF;
END $$;

ALTER TABLE "booking_requests" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "booking_requests"
  ADD CONSTRAINT "booking_requests_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "booking_requests"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

CREATE INDEX "booking_requests_companyId_status_idx"
  ON "booking_requests"("companyId", "status");
CREATE INDEX "booking_requests_companyId_createdAt_idx"
  ON "booking_requests"("companyId", "createdAt");
CREATE INDEX "booking_requests_linkId_idx"
  ON "booking_requests"("linkId");
