import { ReferenceEnvelopeFields } from '../rail-reference';

/**
 * Transfer yards.
 *
 * THIS CATALOG IS INTENTIONALLY EMPTY. The brief asks for 11 transfer yards with gauge,
 * electrification, maximum axle load, vehicle profile, maximum train length, siding capacity
 * and a contact directory. None of that is in the repository or in the annexures supplied on
 * 2026-10-02: the yard list lives in Network Statement Chapter 2 and in "List of Yards.xlsx"
 * (referenced by Annexure 40 item 1), neither of which was supplied. Inventing eleven yards
 * and their limits would put fabricated operating data into a safety-adjacent system.
 *
 * The schema (rail_yard_specs), validation, seeder, API and UI are complete: add an entry
 * below — with `sourceRef` and, once reviewed, `dataStatus: 'VERIFIED'` and `verifiedBy` —
 * and re-run the reference seeder. `getReferenceCompleteness()` surfaces "0 of 11" until then.
 */
export interface YardCatalogEntry extends ReferenceEnvelopeFields {
  corridorCode: string | null;
  isTransferYard: boolean;
  sidingCapacityWagons: number | null;
  notes: string;
}

/** The brief's expected number of transfer yards. [BRIEF — not corroborated by a supplied document] */
export const EXPECTED_TRANSFER_YARD_COUNT = 11;
/** The V4 corridor count. Evidenced: source register §11.4 / EXC-020. */
export const EXPECTED_CORRIDOR_COUNT = 6;

export const YARD_CATALOG: readonly YardCatalogEntry[] = [];
