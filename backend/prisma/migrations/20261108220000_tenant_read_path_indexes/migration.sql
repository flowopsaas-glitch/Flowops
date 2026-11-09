-- Tenant-scoped read path: index the tenant column.
--
-- Every tenant-scoped read in the application filters on companyId, and the RLS
-- policy evaluates app_tenant_guard("companyId") on every row access. These tables
-- carried no index leading on companyId, so both were sequential scans — on the
-- hottest of them (drivers, invoices, users, collections, shipments) that is every
-- list view in the product.
--
-- Deliberately NOT indexed: error_events (write-heavy log, near-zero tenant reads),
-- and workflows / leads (no tenant-scoped read sites). Indexes cost writes; these
-- would have been paid for on every insert and returned nothing.
--
-- IF NOT EXISTS so the migration is re-runnable against a database that already
-- carries one of these from an earlier partial rollout.

CREATE INDEX IF NOT EXISTS "ai_events_companyId_idx" ON "ai_events"("companyId");
CREATE INDEX IF NOT EXISTS "api_keys_companyId_idx" ON "api_keys"("companyId");
CREATE INDEX IF NOT EXISTS "branches_companyId_idx" ON "branches"("companyId");
CREATE INDEX IF NOT EXISTS "cod_transactions_companyId_idx" ON "cod_transactions"("companyId");
CREATE INDEX IF NOT EXISTS "collections_companyId_idx" ON "collections"("companyId");
CREATE INDEX IF NOT EXISTS "drivers_companyId_idx" ON "drivers"("companyId");
CREATE INDEX IF NOT EXISTS "invoices_companyId_idx" ON "invoices"("companyId");
CREATE INDEX IF NOT EXISTS "manifests_companyId_idx" ON "manifests"("companyId");
CREATE INDEX IF NOT EXISTS "payments_companyId_idx" ON "payments"("companyId");
CREATE INDEX IF NOT EXISTS "quotes_companyId_idx" ON "quotes"("companyId");
CREATE INDEX IF NOT EXISTS "rate_cards_companyId_idx" ON "rate_cards"("companyId");
CREATE INDEX IF NOT EXISTS "shipments_companyId_idx" ON "shipments"("companyId");
CREATE INDEX IF NOT EXISTS "users_companyId_idx" ON "users"("companyId");
CREATE INDEX IF NOT EXISTS "waybill_inbox_items_companyId_idx" ON "waybill_inbox_items"("companyId");
CREATE INDEX IF NOT EXISTS "webhook_endpoints_companyId_idx" ON "webhook_endpoints"("companyId");
