import { ContactEntry, ReferenceEnvelopeFields } from '../rail-reference';

/**
 * The six V4 corridors (Container, Cape, Ore, North, North-East, Central).
 *
 * WHAT IS EVIDENCED:
 *   - the six names: source register §11.4 (V4 column) and register EXC-020 (V4 renamed
 *     Natal→Container, Cape 2→Ore, Cape 1→Cape, Northern→North);
 *   - the Annexure 33b route names each corridor is *indicatively* mapped to: source
 *     register §11.4, which itself says the mapping "is indicative only … has to be
 *     confirmed" (also §9 item 5, sub-item 5).
 *
 * WHAT IS NOT: gauge, electrification, maximum axle load, vehicle profile and maximum train
 * length for each corridor come from Network Statement Chapter 2, which was never supplied to
 * this repository. They are therefore NULL / empty and `dataStatus` is SOURCE_PENDING. They
 * are not estimated. The envelope check reports such a corridor as UNVERIFIED and never
 * rejects against it. To load real values: edit this file (with `sourceRef` and `verifiedBy`),
 * set `dataStatus: 'VERIFIED'`, and re-run the reference seeder.
 */
export interface CorridorCatalogEntry extends ReferenceEnvelopeFields {
  aliases: string[];
  workbookRoutes: string[];
  sortOrder: number;
  notes: string;
  /**
   * Which network's corridors these are, by network CODE. The seeder resolves
   * it to an id; a code with no matching network is seeded with NULL rather
   * than failing, so a catalog row cannot block a seed.
   */
  networkCode: string;
}

const IDENTITY_SOURCE = 'Identity: source register §11.4 + requirement register EXC-020. Technical envelope: Network Statement V4 Chapter 2 — NOT SUPPLIED.';
const PENDING = {
  gauge: null, electrification: [] as string[], maxAxleLoadTonnes: null, vehicleProfile: null, maxTrainLengthM: null,
  contacts: [] as ContactEntry[], dataStatus: 'SOURCE_PENDING' as const, sourceRef: IDENTITY_SOURCE, verifiedBy: null,
};

export const CORRIDOR_CATALOG: readonly CorridorCatalogEntry[] = [
  { ...PENDING, networkCode: 'transnet', code: 'COR-CONTAINER', name: 'Container', aliases: ['Natal'], sortOrder: 10,
    workbookRoutes: ['General Freight: Johannesburg to Durban'],
    notes: 'Workbook route mapped to "Container / North corridor" in source register §11.4 — shared label, mapping unconfirmed.' },
  { ...PENDING, networkCode: 'transnet', code: 'COR-CAPE', name: 'Cape', aliases: ['Cape 1'], sortOrder: 20,
    workbookRoutes: ['General Freight: Johannesburg to Cape Town', 'General Freight: Vereeniging/Danskraal to East London'],
    notes: 'Source register §10.1: no electric traction operates on parts of Vereeniging/Danskraal–East London (decommissioned OHTE/substations).' },
  { ...PENDING, networkCode: 'transnet', code: 'COR-ORE', name: 'Ore', aliases: ['Cape 2'], sortOrder: 30,
    workbookRoutes: ['Ore'], notes: '' },
  { ...PENDING, networkCode: 'transnet', code: 'COR-NORTH', name: 'North', aliases: ['Northern'], sortOrder: 40,
    workbookRoutes: ['Manganese', 'General Freight & Export Coal: Lephalale to Richards Bay', 'General Freight: Musina - Pyramid South/Hoedspruit'],
    notes: 'Source register §10.1: Musina–Pyramid/Hoedspruit is not electrified.' },
  { ...PENDING, networkCode: 'transnet', code: 'COR-NORTH-EAST', name: 'North-East', aliases: [], sortOrder: 50,
    workbookRoutes: ['Magnetite', 'Eastern Mainline: Rayton to Komatipoort/Richards Bay'],
    notes: 'Source register §10.1: Magnetite is not electrified.' },
  { ...PENDING, networkCode: 'transnet', code: 'COR-CENTRAL', name: 'Central', aliases: [], sortOrder: 60,
    workbookRoutes: ['General Freight: Mafikeng to Beaconsfield/Potchefstroom'], notes: '' },
];

/** Contacts that ARE in the supplied material: function mailboxes, not people (source register §1). */
export const NETWORK_CONTACTS: readonly (ContactEntry & { source: string })[] = [
  { role: 'Infrastructure Manager — general enquiries', function: 'TRIM', email: 'infrastructuremanager@transnet.net', source: 'source register §1 (Network Statement §1.8)' },
  { role: 'Access (train-path) applications', function: 'TRIM', email: 'TrainPathapplications202526q1@transnet.net',
    notes: 'The mailbox name carries a 2025/26 Q1 vintage — confirm it is still the 2026/27 intake address.',
    source: 'source register §1 (Network Statement §1.8)' },
];
