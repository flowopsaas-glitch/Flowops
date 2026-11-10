-- Corridors belong to a network.
--
-- The six corridors in the catalogue are Transnet's V4 corridors, and every
-- tenant was offered all of them. A possession window is a booking of track on
-- a specific corridor, so a European operator was invited to book maintenance
-- on the Ore line between Sishen and Saldanha.
--
-- NULL is deliberately offered to every tenant rather than to nobody: rows
-- seeded before this column existed carry NULL, and treating NULL as "not
-- mine" would make every existing corridor vanish overnight.

ALTER TABLE "rail_corridor_nodes"
  ADD COLUMN IF NOT EXISTS "networkId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rail_corridor_nodes_networkId_fkey'
  ) THEN
    ALTER TABLE "rail_corridor_nodes"
      ADD CONSTRAINT "rail_corridor_nodes_networkId_fkey"
      FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rail_corridor_nodes_networkId_idx"
  ON "rail_corridor_nodes"("networkId");
