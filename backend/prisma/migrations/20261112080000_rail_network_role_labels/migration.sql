-- Rail networks carry the words each role is called on that network.
--
-- `RailAttribution.TRIM` and `RailChangeInitiator.PRASA_OTHER_IM` name ROLES --
-- the infrastructure manager, another infrastructure manager -- in Transnet's
-- words. The enum values are persisted in rows, form part of the API contract
-- and appear in DTO validation, so they stay: renaming them would be a
-- migration and a breaking change to buy a cosmetic improvement. What varies
-- by network is the word an operator is shown, and that is what this column
-- carries.
--
-- Shape: { "TRIM": "Network Rail", "TOC": "Train Operator" }. A role absent
-- from the map falls back to the Transnet wording, so a partial seed still
-- reads as a sentence. NULL means "use every Transnet label", which is the
-- current behaviour for every existing row.

ALTER TABLE "rail_networks"
  ADD COLUMN IF NOT EXISTS "roleLabels" JSONB;
