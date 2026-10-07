-- Provenance link from a waybill back to the collection it was created from.
-- Nullable + additive: existing rows keep working, and the driver-app
-- confirmation writes it inside the same transaction that marks the collection
-- COLLECTED (idempotent offline replay, traceable pickup).
ALTER TABLE "waybills" ADD COLUMN "sourceCollectionId" TEXT;

CREATE INDEX "waybills_sourceCollectionId_idx" ON "waybills"("sourceCollectionId");
