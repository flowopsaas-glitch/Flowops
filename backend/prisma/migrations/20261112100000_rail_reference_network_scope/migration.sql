-- Reference catalogues belong to a network.
--
-- These three tables hold Transnet source documents: the Annexure 20b
-- cancellation codes, the tariff schedules, and the Annexure 40 ancillary
-- services catalogue. Every tenant was offered all of them, so a European
-- operator picked their cancellation reason from an 82-row Transnet annexure
-- and priced the job off Transnet's tariff schedule.
--
-- NULL is offered to every tenant rather than to nobody: rows seeded before
-- this column existed carry NULL, and treating NULL as "not mine" instead of
-- "not attributed yet" would make every existing row vanish the moment this
-- shipped.

ALTER TABLE "rail_cancellation_codes" ADD COLUMN IF NOT EXISTS "networkId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rail_cancellation_codes_networkId_fkey') THEN
    ALTER TABLE "rail_cancellation_codes"
      ADD CONSTRAINT "rail_cancellation_codes_networkId_fkey"
      FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rail_cancellation_codes_networkId_idx" ON "rail_cancellation_codes"("networkId");

ALTER TABLE "rail_tariff_schedules" ADD COLUMN IF NOT EXISTS "networkId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rail_tariff_schedules_networkId_fkey') THEN
    ALTER TABLE "rail_tariff_schedules"
      ADD CONSTRAINT "rail_tariff_schedules_networkId_fkey"
      FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rail_tariff_schedules_networkId_idx" ON "rail_tariff_schedules"("networkId");

ALTER TABLE "rail_ancillary_services" ADD COLUMN IF NOT EXISTS "networkId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rail_ancillary_services_networkId_fkey') THEN
    ALTER TABLE "rail_ancillary_services"
      ADD CONSTRAINT "rail_ancillary_services_networkId_fkey"
      FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rail_ancillary_services_networkId_idx" ON "rail_ancillary_services"("networkId");
