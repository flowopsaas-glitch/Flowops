import { ContactEntry, ReferenceEnvelopeFields } from '../rail-reference';

/**
 * The six V4 corridors (Container, Cape, Ore, North, North-East, Central).
 *
 * IDENTITY — from source register §11.4 (V4 column) and register EXC-020, which records the
 *   renames Natal→Container, Cape 2→Ore, Cape 1→Cape, Northern→North. The Annexure 33b route
 *   names each corridor is *indicatively* mapped to also come from register §11.4, which itself
 *   says the mapping "is indicative only … has to be confirmed".
 *
 * TECHNICAL ENVELOPE — from Network Statement Volume 4, 18 September 2026, Chapter 2 §2.8–2.13.
 *   Every figure below is transcribed from that document and cited per corridor in `sourceRef`.
 *   Two rules were observed while transcribing, and both matter:
 *
 *   1. A corridor-level column holds the GENERAL limit the document states. Where Chapter 2
 *      then departs from it by section, the departure is recorded in `envelopeExceptions`
 *      rather than being averaged away or flattened into the general figure. North is 20 t
 *      generally but 26 t on two named stretches and 18.5 t on a third; recording 26 t as
 *      "the" axle load would let someone plan an overweight train on the 18.5 t section.
 *   2. Nothing is inferred. What the document does not state stays null.
 *
 * STILL MISSING, AND DELIBERATELY NULL:
 *   - `vehicleProfile` — §2.x.1.4 defers the loading gauge to Annexures 2 (Track Structure
 *     Clearances) and 3 (Track Structure Vehicle Gauges), neither of which was supplied.
 *   - a ruling gradient — §2.x.1.7 defers to Annexure 5 (Line Gradients per Section), not supplied.
 *   - which sections carry Cape's 16.5 t and North-East's 18.5 t branch-line limits — §2.11.1.6
 *     and §2.10.1.6 defer to Annexure 6 (Simplified Classification File), not supplied.
 *
 * Because `vehicleProfile` is null, no corridor can be VERIFIED: `validateReferenceEntry` holds
 * VERIFIED to the whole envelope. They are PARTIAL, which is the honest state — real, cited,
 * incomplete. The envelope check therefore still warns rather than rejects against them.
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

const NS = 'Network Statement V4 (18 Sep 2026)';
const IDENTITY_SOURCE = 'Identity: source register §11.4 + requirement register EXC-020.';

/** The gauge the Network Statement declares. It writes "1 065mm"; the engineering figure is 1067 mm. */
const CAPE_GAUGE = 'CAPE_1067MM' as const;

export const CORRIDOR_CATALOG: readonly CorridorCatalogEntry[] = [
  {
    networkCode: 'transnet', code: 'COR-NORTH', name: 'North', aliases: ['Northern'], sortOrder: 40,
    workbookRoutes: ['Manganese', 'General Freight & Export Coal: Lephalale to Richards Bay', 'General Freight: Musina - Pyramid South/Hoedspruit'],

    gauge: CAPE_GAUGE,
    electrification: ['DIESEL', 'AC_25KV', 'DC_3KV'],
    maxAxleLoadTonnes: 20,
    vehicleProfile: null,
    maxTrainLengthM: 2000,
    envelopeExceptions: [
      { kind: 'AXLE_LOAD', sections: 'Blackhill via Ogies and Ermelo to Richards Bay; Trichardt to Ermelo', tonnes: 26,
        note: '§2.8.1.6 — the heavy-haul export route is cleared above the 20 t corridor general limit.' },
      { kind: 'AXLE_LOAD', sections: 'Empangeni – Nkwalini', tonnes: 18.5,
        note: '§2.8.1.6 — cleared BELOW the 20 t general limit. Planning to 20 t here would overload the section.' },
    ],
    contacts: [] as ContactEntry[],
    dataStatus: 'PARTIAL',
    sourceRef: `${NS} §2.8.1.3 (gauge), §2.8.1.5 (200 wagons ≈ 2000 m), §2.8.1.6 (20/26/18.5 t), §2.8.1.10 (diesel + 25 kV AC + 3 kV DC). ${IDENTITY_SOURCE}`,
    verifiedBy: null,
    notes: [
      'Source register §10.1: Musina–Pyramid/Hoedspruit is not electrified.',
      '§2.8.1.10 Table 2: Lephalale–Rustenburg diesel; Rustenburg–Pyramid South 25 kV AC; Pyramid South–Ermelo, Welgedag–Ogies and Ogies–Ermelo 3 kV DC; Ermelo–Richards Bay 25 kV AC. Changeover stations at Pyramid South and Ermelo.',
      '§2.8.1.6 gives the 18.5 t and 26 t sections by name; Annexure 6 (not supplied) carries the rest.',
      'The Network Statement writes the Cape gauge as "1065mm"; the nominal engineering figure is 1067 mm. Recorded as CAPE_1067MM.',
    ].join(' '),
  },
  {
    networkCode: 'transnet', code: 'COR-ORE', name: 'Ore', aliases: ['Cape 2'], sortOrder: 30,
    workbookRoutes: ['Ore'],

    gauge: CAPE_GAUGE,
    electrification: ['AC_50KV'],
    maxAxleLoadTonnes: 30,
    vehicleProfile: null,
    maxTrainLengthM: null, // §2.9.1.5 gives 375 wagons but no metre figure, unlike the other five corridors.
    envelopeExceptions: [],
    contacts: [] as ContactEntry[],
    dataStatus: 'PARTIAL',
    sourceRef: `${NS} §2.9.1.3 (gauge), §2.9.1.5 (375 wagons), §2.9.1.6 (30 t, Sishen–Saldanha only), §2.9.1.10 (50 kV AC). ${IDENTITY_SOURCE}`,
    verifiedBy: null,
    notes: [
      '§2.9.1.6: "The 30 tons per axle is only applicable to trains that are loaded on the defined line between Sishen and Saldanha and any traffic originating from connected networks on other corridors is limited to the axle weight for the sections of line traversed on that corridor."',
      'The 30 t figure is therefore NOT a through rate: it governs Sishen–Saldanha, and inter-corridor traffic falls back to the limits of the corridors it crosses.',
      '§2.9.1.5 states 375 wagons with no length in metres, so no length is recorded.',
    ].join(' '),
  },
  {
    networkCode: 'transnet', code: 'COR-NORTH-EAST', name: 'North-East', aliases: [], sortOrder: 50,
    workbookRoutes: ['Magnetite', 'Eastern Mainline: Rayton to Komatipoort/Richards Bay'],

    gauge: CAPE_GAUGE,
    electrification: ['DC_3KV', 'DIESEL'],
    maxAxleLoadTonnes: 20,
    vehicleProfile: null,
    maxTrainLengthM: 1600,
    envelopeExceptions: [
      { kind: 'AXLE_LOAD', sections: 'Certain branch lines — the document defers the list to Annexure 6, which was not supplied', tonnes: 18.5,
        note: '§2.10.1.6 — "20 tons per axle except for certain branch lines … that will be 18.5 tons per axle". Which branch lines is not stated in Chapter 2.' },
    ],
    contacts: [] as ContactEntry[],
    dataStatus: 'PARTIAL',
    sourceRef: `${NS} §2.10.1.3 (gauge), §2.10.1.5 (160 wagons ≈ 1600 m), §2.10.1.6 (20 t, 18.5 t branch lines), §2.10.1.10 (3 kV DC + diesel). ${IDENTITY_SOURCE}`,
    verifiedBy: null,
    notes: [
      'Source register §10.1: Magnetite is not electrified.',
      '§2.10.1.10: 3 kV DC with some sections not electrified; a changeover station at Pyramid switches 25 kV AC to diesel because of OHTE theft.',
      '§2.10.1.5 scopes the 160 wagons / 1600 m to the Phalaborwa–Komatipoort main line.',
    ].join(' '),
  },
  {
    networkCode: 'transnet', code: 'COR-CAPE', name: 'Cape', aliases: ['Cape 1'], sortOrder: 20,
    workbookRoutes: ['General Freight: Johannesburg to Cape Town', 'General Freight: Vereeniging/Danskraal to East London'],

    gauge: CAPE_GAUGE,
    electrification: ['DIESEL', 'AC_25KV', 'DC_3KV'],
    maxAxleLoadTonnes: 20, // upper bound of the stated 16.5–20 t range
    vehicleProfile: null,
    maxTrainLengthM: 1150,
    envelopeExceptions: [
      { kind: 'AXLE_LOAD', sections: 'The sections the document rates at 16.5 t — deferred to Annexure 6, which was not supplied', tonnes: 16.5,
        note: '§2.11.1.6 — "a maximum permissible weight of between 16.5 and 20 Tonnes per axle". 16.5 t is the lower bound; which sections is not stated in Chapter 2.' },
      { kind: 'GAUGE', sections: 'Humewood Road (Gqeberha) to Gamtoos to Avontuur, and Patensie', gauge: 'NARROW_610MM',
        note: '§2.11.1.3 — these branch lines are 610 mm narrow gauge. The corridor-level gauge column holds the predominant Cape gauge and cannot express both.' },
      { kind: 'TRAIN_LENGTH', sections: 'Beaufort West to Bellville', metres: 600,
        note: '§2.11.1.5 — 50 wagons ≈ 600 m, well short of the 1150 m Hotazel–Gqeberha figure.' },
    ],
    contacts: [] as ContactEntry[],
    dataStatus: 'PARTIAL',
    sourceRef: `${NS} §2.11.1.3 (1 065 mm predominant, 610 mm branches), §2.11.1.5 (104 wagons ≈ 1150 m; 50 wagons ≈ 600 m), §2.11.1.6 (16.5–20 t), §2.11.1.10 (diesel + 25 kV AC + 3 kV DC). ${IDENTITY_SOURCE}`,
    verifiedBy: null,
    notes: [
      'Source register §10.1: no electric traction operates on parts of Vereeniging/Danskraal–East London (decommissioned OHTE/substations).',
      '§2.11.1.10: the East London route runs diesel between Bloemfontein and Springfontein and 25 kV AC Springfontein–East London, but diesel is actually used because of cable theft — the line is earmarked for de-electrification.',
    ].join(' '),
  },
  {
    networkCode: 'transnet', code: 'COR-CENTRAL', name: 'Central', aliases: [], sortOrder: 60,
    workbookRoutes: ['General Freight: Mafikeng to Beaconsfield/Potchefstroom'],

    gauge: CAPE_GAUGE,
    electrification: ['DC_3KV', 'DIESEL'],
    maxAxleLoadTonnes: 20,
    vehicleProfile: null,
    maxTrainLengthM: 1200,
    envelopeExceptions: [],
    contacts: [] as ContactEntry[],
    dataStatus: 'PARTIAL',
    sourceRef: `${NS} §2.12.1.3 (gauge), §2.12.1.5 (105 wagons ≈ 1200 m), §2.12.1.6 (20 t), §2.12.1.10 (3 kV DC + diesel). ${IDENTITY_SOURCE}`,
    verifiedBy: null,
    notes: '§2.12.1.10: 3 kV DC with some sections not electrified; diesel is in use on the Hawerklip, Voelfontein and Lichtenburg lines because of OHTE theft.',
  },
  {
    networkCode: 'transnet', code: 'COR-CONTAINER', name: 'Container', aliases: ['Natal'], sortOrder: 10,
    workbookRoutes: ['General Freight: Johannesburg to Durban'],

    gauge: CAPE_GAUGE,
    electrification: ['DC_3KV', 'DIESEL'],
    maxAxleLoadTonnes: 20,
    vehicleProfile: null,
    maxTrainLengthM: 1200,
    envelopeExceptions: [],
    contacts: [] as ContactEntry[],
    dataStatus: 'PARTIAL',
    sourceRef: `${NS} §2.13.1.3 (gauge), §2.13.1.5 (≈1200 m), §2.13.1.6 (20 t), §2.13.1.10 (3 kV DC + diesel). ${IDENTITY_SOURCE}`,
    verifiedBy: null,
    notes: [
      'Workbook route mapped to "Container / North corridor" in source register §11.4 — shared label, mapping unconfirmed.',
      '§2.13.1.5 reads "a maximum of 1050 Rail Wagons. approximately 1200m train length", which cannot both be true — 1050 wagons is roughly 12 km. Central §2.12.1.5 states 105 wagons ≈ 1200 m.',
      'We therefore record the 1200 m length, which is corroborated by Central, and leave the published wagon count visible here rather than silently correcting the document. Confirm against Annexure 4 before relying on a wagon count.',
      '§2.13.1.10: City Deep–Durban is 3 kV DC from Union to Bayhead; diesel is in use around Ladysmith because of OHTE theft.',
    ].join(' '),
  },
];

/** Contacts that ARE in the supplied material: function mailboxes, not people (source register §1). */
export const NETWORK_CONTACTS: readonly (ContactEntry & { source: string })[] = [
  { role: 'Infrastructure Manager — general enquiries', function: 'TRIM', email: 'infrastructuremanager@transnet.net', source: 'source register §1 (Network Statement §1.8)' },
  { role: 'Access (train-path) applications', function: 'TRIM', email: 'TrainPathapplications202526q1@transnet.net',
    notes: 'The mailbox name carries a 2025/26 Q1 vintage — confirm it is still the 2026/27 intake address.',
    source: 'source register §1 (Network Statement §1.8)' },
];
