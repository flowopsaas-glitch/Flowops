/**
 * Annexure 20b — Main train cancellation reasons allocated to responsible parties.
 * Source: "ANNEXURE 20b — MAIN TRAIN CANCELLATION REASONS ALLOCATED TO RESPONSIBLE PARTIES",
 * v1.3, updated 19 May 2023, supplied by the project owner on 2026-10-02.
 *
 * The 82 rows below are in the EXACT order and wording of the source. The source has
 * NO codes: `CNX-nnn` is a FlowOps-assigned stable key = the row number in v1.3. When a
 * later version of the annexure is supplied, APPEND new rows — never renumber, because
 * historic change requests reference these codes.
 *
 * Annexure 20b's "Rail Operations" is the train-operating side (TOC); "Infrastructure
 * Manager" is TRIM. Ten rows are not allocated by the annexure at all ("Could be …"):
 * they must be allocated through the Clearinghouse (Annexure 21), so they map to
 * ALLOCATION_REQUIRED and are never defaulted to either party.
 */

export type Annexure20bParty =
  | 'RAIL_OPERATIONS'
  | 'INFRASTRUCTURE_MANAGER'
  | 'FORCE_MAJEURE'
  | 'ALLOCATION_REQUIRED';

export interface CancellationCodeEntry {
  /** FlowOps-assigned key: CNX-001 … CNX-082 (source row number in v1.3). */
  code: string;
  /** Source row number (1-based) in Annexure 20b v1.3. */
  sourceRow: number;
  /** Cancellation reason, verbatim. */
  reason: string;
  /** Allocation as the annexure states it. ALLOCATION_REQUIRED when the source says "Could be …". */
  responsibleParty: Annexure20bParty;
  /** For ALLOCATION_REQUIRED rows: the parties the annexure says it could be. Empty otherwise. */
  possibleParties: Exclude<Annexure20bParty, 'ALLOCATION_REQUIRED'>[];
  /** The "Responsible Party" cell, verbatim. */
  sourceText: string;
}

export const ANNEXURE_20B_VERSION = 'v1.3 (updated 19 May 2023)';

/** [Cancellation Reason, Responsible Party] — verbatim, source order. */
const RAW_ANNEXURE_20B: ReadonlyArray<readonly [string, string]> = [
  ['Abnormal working / yard', 'Rail Operations'],
  ['Animal hit by train', 'Force Majeure'],
  ['Assets Fire Damage', 'Could be Force Majeure, Infrastructure Manager or Rail Operations'],
  ['Auxiliary equipment related', 'Rail Operations'],
  ['Averted collision', 'Rail Operations'],
  ['Bridge collapsed', 'Infrastructure Manager'],
  ['Broken axle', 'Rail Operations'],
  ['Broken rail', 'Infrastructure Manager'],
  ['Cable Theft', 'Infrastructure Manager'],
  ['Carriage & Wagons related', 'Rail Operations'],
  ['Collision', 'Rail Operations'],
  ['Community unrest', 'Force Majeure'],
  ['Container / Container Terminal Related', 'Rail Operations'],
  ['Covid-19', 'Force Majeure'],
  ['Crew issues', 'Rail Operations'],
  ['CTC / Train Authorisation related', 'Infrastructure Manager'],
  ['Customer-related', 'Rail Operations'],
  ['Dangerous Goods / Environmental Spillage and Leakage related', 'Rail Operations'],
  ['Derailment', 'Could be Force Majeure, Infrastructure Manager or Rail Operations'],
  ['ECP failure', 'Rail Operations'],
  ['Electrical Substation related', 'Infrastructure Manager'],
  ['Emergency brake application', 'Rail Operations'],
  ['EOT Device / Telemeter Failure', 'Rail Operations'],
  ['Eskom related issues / Power Failure', 'Infrastructure Manager'],
  ['Hook-up', 'Could be Infrastructure Manager or Rail Operations'],
  ['ICTM / System / Network-related', 'Could be Infrastructure Manager or Rail Operations'],
  ['Industrial Action', 'Could be Force Majeure, Infrastructure Manager or Rail Operations'],
  ['Injury / Death of Personnel', 'Could be Force Majeure, Infrastructure Manager or Rail Operations'],
  ['ITP not adjusted / ITP related issues', 'Infrastructure Manager'],
  ['Kombi issues', 'Rail Operations'],
  ['Level Crossing related', 'Infrastructure Manager'],
  ['Line obstruction', 'Infrastructure Manager'],
  ['Loco await inspection or repair', 'Rail Operations'],
  ['Loco battery theft', 'Rail Operations'],
  ['Loco failure', 'Rail Operations'],
  ['Loco undersupply', 'Rail Operations'],
  ['Loco imbalance', 'Rail Operations'],
  ['Loco planning', 'Rail Operations'],
  ['Loco refuelling', 'Rail Operations'],
  ['Municipality related', 'Infrastructure Manager'],
  ['No / late Empty Wagon Supply', 'Rail Operations'],
  ['No Product', 'Rail Operations'],
  ['Non compliance to plans (ITP, YPP)', 'Rail Operations'],
  ['Non-supply of Materials', 'Infrastructure Manager'],
  ['NWB issues', 'Infrastructure Manager'],
  ['OBC-related failures', 'Rail Operations'],
  ['Occupations related', 'Infrastructure Manager'],
  ['OHTE related', 'Infrastructure Manager'],
  ['On-Track Machines Related', 'Infrastructure Manager'],
  ['Over- / Skew Loading', 'Rail Operations'],
  ['Overborder issues', 'Infrastructure Manager'],
  ['Pandroll springs theft', 'Infrastructure Manager'],
  ['Perway related', 'Infrastructure Manager'],
  ['Point Theft', 'Infrastructure Manager'],
  ['Point failure', 'Infrastructure Manager'],
  ['Points ran through', 'Rail Operations'],
  ['Port issues (TPT)', 'Infrastructure Manager'],
  ['Port windbound', 'Force Majeure'],
  ['PRASA issues', 'Infrastructure Manager'],
  ['Product Contamination', 'Rail Operations'],
  ['Radio / TDU failure', 'Rail Operations'],
  ['Rail Network related', 'Infrastructure Manager'],
  ['Railway Technology related', 'Infrastructure Manager'],
  ["Removal of Not-to-Go's", 'Rail Operations'],
  ['Rolling Stock Maintenance Related', 'Rail Operations'],
  ['Runaway Rail Wagons', 'Rail Operations'],
  ['Section Congested', 'Could be Infrastructure Manager or Rail Operations'],
  ['Yard / Siding congestion', 'Could be Infrastructure Manager or Rail Operations'],
  ['Security related', 'Infrastructure Manager'],
  ['Shunting challenges', 'Rail Operations'],
  ['SPAD', 'Rail Operations'],
  ['Speed Restrictions related', 'Infrastructure Manager'],
  ['TE related issues', 'Rail Operations'],
  ['Train Robbery', 'Could be Infrastructure Manager or Rail Operations'],
  ['Theft', 'Infrastructure Manager'],
  ['Vandalism', 'Could be Force Majeure, Infrastructure Manager or Rail Operations'],
  ['Wagons related', 'Rail Operations'],
  ['Wash away', 'Force Majeure'],
  ['Wayside Readers faulty', 'Infrastructure Manager'],
  ['Weather', 'Force Majeure'],
  ['Weigh Bridge not functioning / not calibrated', 'Infrastructure Manager'],
  ['Yard Derailment', 'Rail Operations'],
];

const SINGLE_PARTY: Record<string, Exclude<Annexure20bParty, 'ALLOCATION_REQUIRED'>> = {
  'Rail Operations': 'RAIL_OPERATIONS',
  'Infrastructure Manager': 'INFRASTRUCTURE_MANAGER',
  'Force Majeure': 'FORCE_MAJEURE',
};

/** Parse a "Responsible Party" cell. Throws on anything the annexure never used, so a typo cannot slip in. */
export function parseAnnexure20bParty(cell: string): {
  responsibleParty: Annexure20bParty;
  possibleParties: Exclude<Annexure20bParty, 'ALLOCATION_REQUIRED'>[];
} {
  if (SINGLE_PARTY[cell]) return { responsibleParty: SINGLE_PARTY[cell], possibleParties: [] };
  const m = /^Could be (.+)$/.exec(cell);
  if (!m) throw new Error(`Annexure 20b: unrecognised responsible party "${cell}"`);
  const possibleParties = m[1].split(/,\s*|\s+or\s+/).filter(Boolean).map((p) => {
    const party = SINGLE_PARTY[p.trim()];
    if (!party) throw new Error(`Annexure 20b: unrecognised party "${p}" in "${cell}"`);
    return party;
  });
  return { responsibleParty: 'ALLOCATION_REQUIRED', possibleParties };
}

export const CANCELLATION_CODE_CATALOG: readonly CancellationCodeEntry[] = RAW_ANNEXURE_20B.map(
  ([reason, sourceText], i) => ({
    code: `CNX-${String(i + 1).padStart(3, '0')}`,
    sourceRow: i + 1,
    reason,
    sourceText,
    ...parseAnnexure20bParty(sourceText),
  }),
);

export function findCancellationCode(code: string): CancellationCodeEntry | undefined {
  return CANCELLATION_CODE_CATALOG.find((c) => c.code === code);
}
