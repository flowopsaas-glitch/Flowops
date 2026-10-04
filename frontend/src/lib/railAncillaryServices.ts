/**
 * TRIM Annexure 40 — Ancillary Services Catalogue 2026/27.
 *
 * Source: docs/TRIM-ANNEXURE-43-40-SUPPLIED-SOURCE-2026-10-04.md
 * Supplied by the owner 2026-10-04. Network Statement V4, FY2026/27.
 *
 * ============================================================================
 * THIS CATALOGUE CARRIES NO PRICES.
 * ============================================================================
 *
 * Annexure 40 as supplied is a catalogue, not a tariff. All 40 line items
 * define a unit of measure and none defines a Rand value. Eight items are
 * marked TBD in the source itself.
 *
 * So `rateZar` is null on every entry, and that is deliberate rather than
 * unfinished. It is typed `null` rather than `number | null` specifically so
 * that no caller can populate it from this file: the moment a tariff arrives,
 * this changes to a lookup against a separate, sourced rate table, and the
 * compiler will point at every place that assumed otherwise.
 *
 * Ancillary services usage can be RECORDED against this catalogue. It cannot
 * be PRICED. Any screen that shows a Rand figure for an ancillary service
 * before a tariff sheet exists is showing a number somebody invented.
 */

export type AncillaryTier = 1 | 2 | 3 | 4;

export interface AncillaryService {
  /** Line number as it appears in the catalogue, e.g. "4c". */
  ref: string;
  tier: AncillaryTier;
  name: string;
  description: string;
  /** Unit of measure, verbatim from the catalogue. */
  unit: string;
  /** Parent line when this is a sub-item (e.g. "4c" belongs to "4"). */
  parent?: string;
  /**
   * True when the source marks this TBD. Eight items: 34a-34g and 40.
   * These have no basis for pricing at all, not merely no price supplied.
   */
  tbd: boolean;
  /** Always null — see the block above. EXC-043-01 / EXC-043-02. */
  rateZar: null;
}

export const TIER_LABELS: Record<AncillaryTier, string> = {
  1: 'Tier 1 — Infrastructure Access Services',
  2: 'Tier 2 — Rail Critical Support Services',
  3: 'Tier 3 — Optional Rail Support Services',
  4: 'Tier 4 — Non-Rail Services',
};

export const TIER_DESCRIPTIONS: Record<AncillaryTier, string> = {
  1: 'Safety critical and compulsory services essential for day-to-day train operations',
  2: 'Safety Critical Services for rail operations but non-compulsory for day-to-day running of trains',
  3: 'Engineering and Technical support services for the development and maintenance of rail infrastructure',
  4: 'Telecoms, Property and safety & emergency services outside rail operations',
};

const t1 = (ref: string, parent: string | undefined, name: string, description: string, unit: string): AncillaryService =>
  ({ ref, tier: 1, name, description, unit, parent, tbd: false, rateZar: null });

export const ANCILLARY_SERVICES: AncillaryService[] = [
  // ── Tier 1: Infrastructure Access Services ────────────────────────────────
  t1('1', undefined, 'Yards: shunting and marshalling services',
    'Provision of ancillary facilities services such as shunting, staging, inspections, assembling and dispatching trains, including the use of waiting rooms and ablution facilities for TOC crews, where available. (List of Yards.xlsx)',
    'Per wagon movement (GF <50 wagons; Medium heavy >50 <100; heavy >100)'),
  t1('2', undefined, 'Inland terminals: handling of containerized cargo for modal transfers',
    'Provision of containerized cargo handling and modal transfers services at TRIM owned inland terminals. Fee includes access to and use of waiting rooms and ablution facilities where available. (List of Terminals.xlsx)',
    'Per container handled'),
  t1('3', undefined, 'Radio network (Trunk & Open Channel)',
    'Managed access to TRIM radio network services, including agreed user access, radio subscription packages and service availability support where applicable.',
    'Per radio (monthly subscription)'),
  t1('4a', '4', 'Radio & Telemeter Compliance Testing and Acceptance Support',
    'Batch compliance testing, configuration checks and acceptance testing of TOC radios to verify technical compliance and compatibility with the TRIM radio network.',
    'Per device'),
  t1('4b', '4', 'Radio & Telemeter Programming and Configuration Support',
    'Technical support for radio programming, code plug control, configuration checks and approved user profiles.',
    'Per device'),
  t1('4c', '4', 'TOC Radio Onboarding and Activation',
    'Registration, configuration verification, subscriber activation and controlled connection of TOC radios to the TRIM radio network.',
    'Per radio'),
  t1('4d', '4', 'Train Radio Box and locomotive handset installation and commissioning',
    'Installation, interface verification, antenna and power checks, functional testing and operational acceptance of approved RTB and locomotive radio handset equipment.',
    'Per locomotive'),

  // ── Tier 2: Rail Critical Support Services ─────────────────────────────────
  { ref: '5', tier: 2, name: 'Track and trace data',
    description: "Provision of real-time location and movement tracking services for TOC rolling stock through TRIM's Vehicle Identification System (VIS) and CS90 platforms.",
    unit: 'Per month', tbd: false, rateZar: null },
  { ref: '6', tier: 2, name: 'Rolling stock condition data',
    description: "Provision of condition monitoring data from TRIM's wayside systems (Wheel Profile Monitor, Acoustic Bearing Evaluator, Weigh-in-Motion, etc.) for TOC rolling stock maintenance planning purposes.",
    unit: 'Per month', tbd: false, rateZar: null },
  { ref: '7', tier: 2, name: 'Locomotive pantograph monitoring data',
    description: "Access to data from continuous monitoring and assessment of TOC's locomotive pantographs to ensure safe interaction with overhead traction equipment (OHTE).",
    unit: 'Per loco per month', tbd: false, rateZar: null },
  { ref: '8', tier: 2, name: 'Evaluation of new rolling stock',
    description: 'Comprehensive assessment of new locomotives or wagons to determine safety and technical compatibility on TRIM network.',
    unit: 'Per certificate (certificate for each wagon/loco)', tbd: false, rateZar: null },

  // ── Tier 3: Optional Rail Support Services ─────────────────────────────────
  { ref: '9', tier: 3, name: 'Engineering and technical reviews of rail related project proposals',
    description: 'Review and validation of external rail infrastructure designs and technologies — private sidings, private or concessioned rail lines, substations, new operating philosophies.',
    unit: 'Per hour', tbd: false, rateZar: null },
  { ref: '10', tier: 3, name: 'Weigh bridge calibration test train rental (wagons)',
    description: 'Rental of weigh bridge calibration test train (wagons).',
    unit: 'Per wagon per hour', tbd: false, rateZar: null },
  { ref: '11', tier: 3, name: 'Business case reviews and support',
    description: 'Provision of professional support to develop, assess, and validate business cases for rail-related projects.',
    unit: 'Per hour', tbd: false, rateZar: null },
  { ref: '12', tier: 3, name: 'Weigh bridge repair, calibration and validation',
    description: 'Technical services for calibration, repair and certification of private sidings weighbridges to ensure accuracy and compliance with national standards.',
    unit: 'Per certificate (1 certificate per weighbridge)', tbd: false, rateZar: null },
  { ref: '13', tier: 3, name: 'Rail construction consultancy',
    description: 'Provision of pre-construction support services for third-party rail projects.',
    unit: 'Per hour', tbd: false, rateZar: null },
  { ref: '14', tier: 3, name: 'Rail infrastructure specifications',
    description: "Provision of access to TRIM's standardized rail infrastructure technical specifications (track, signalling, telecoms, yards, depots, etc.) for use by industry participants, contractors, and concessionaires.",
    unit: 'Subscription per annum (fee covers all revisions in that year)', tbd: false, rateZar: null },
  { ref: '15', tier: 3, name: 'Private siding inspections',
    description: 'Inspections of private sidings to ensure safety and operational compliance.',
    unit: 'Per inspection', tbd: false, rateZar: null },
  { ref: '16', tier: 3, name: 'Applications for new or upgraded level crossings',
    description: 'Processing and engineering reviews of level crossing applications for upgrades or new developments.',
    unit: 'Per application', tbd: false, rateZar: null },
  { ref: '17', tier: 3, name: 'Quality assurance, testing and commissioning',
    description: 'Specialist testing and commissioning of rail infrastructure and equipment.',
    unit: 'Per certificate', tbd: false, rateZar: null },
  { ref: '18', tier: 3, name: 'Rental of cabooses',
    description: "Rental of TRIM cabooses to TOC's and third parties.",
    unit: 'Per caboose/day', tbd: false, rateZar: null },
  { ref: '19', tier: 3, name: 'Electrical network capacity analysis',
    description: 'Electrical network planning, conducting capacity and electrical performance simulations.',
    unit: 'Per request', tbd: false, rateZar: null },
  { ref: '20', tier: 3, name: 'Electrical protection review and issuing settings',
    description: 'Conducting electrical protection analysis and issuing protection settings.',
    unit: 'Per application', tbd: false, rateZar: null },
  { ref: '21', tier: 3, name: 'OHTE mechanized condition assessments',
    description: 'Conducting mechanized condition assessments of OHTE.',
    unit: 'Per run', tbd: false, rateZar: null },
  { ref: '22', tier: 3, name: 'Technical investigations',
    description: 'Investigation of failures.',
    unit: 'Per request', tbd: false, rateZar: null },
  { ref: '23', tier: 3, name: 'Pantograph and roof equipment inspection',
    description: 'Inspecting electrical locomotive pantograph and roof equipment.',
    unit: 'Per locomotive', tbd: false, rateZar: null },
  { ref: '24', tier: 3, name: 'Electrical energy performance analysis',
    description: 'Provision of electrical energy performance analysis for locomotives and buildings.',
    unit: 'Per request', tbd: false, rateZar: null },
  { ref: '25', tier: 3, name: 'Electrical Systems and Technology Audits',
    description: 'Auditing of electrical equipment, systems and technology to determine useful lifecycle and asset value.',
    unit: 'Per request', tbd: false, rateZar: null },

  // ── Tier 4: Non-Rail Services ──────────────────────────────────────────────
  { ref: '26', tier: 4, name: 'Unlit dark optic fibre — National Long Distance (50–1000km)',
    description: 'Installation, leasing and maintenance of dark optical fibre NLD links (50–1000km).',
    unit: 'Per installation (once off) / Per month (usage) / Per km per month', tbd: false, rateZar: null },
  { ref: '27', tier: 4, name: 'Dark optic fibre Metro (0–50km); transmission links; data packages',
    description: 'Installation and leasing of metro dark fibre; E1, STM-1/4/16/64 transmission links; data packages at 1 / 2.5 / 5 / 10 Gbps.',
    unit: 'Per installation; per link (once off); per month', tbd: false, rateZar: null },
  { ref: '28', tier: 4, name: 'Dark fibre support services — real estate',
    description: 'Rental of physical space for telecoms equipment: comms room 3×3, utilities (electricity) MRC, site access.',
    unit: 'Per room/month; per site visit', tbd: false, rateZar: null },
  { ref: '29', tier: 4, name: 'Installation of non-TRIM optic fibre cables',
    description: 'Underground and overhead fibre installation.',
    unit: 'Per meter', tbd: false, rateZar: null },
  { ref: '30', tier: 4, name: 'Radio & Wireless Communication Services',
    description: 'Enterprise and non-rail radio network access; UHF/VHF fixed base station and repeater deployment; handheld and mobile radio service; intrinsically safe radio service; marine VHF; radio high-site co-location; port terminal wireless and Navis connectivity support; managed Wi-Fi; narrowband wireless gateway and repeater support.',
    unit: 'Per radio/month; per site/project; per unit; per site/month; per terminal/month; per access point/site/month; per gateway or repeater/month',
    tbd: false, rateZar: null },
  { ref: '31', tier: 4, name: 'Transmission & Data Connectivity Services',
    description: 'Dedicated and managed wavelength; DWDM/OTN managed transport; Carrier Ethernet (E-Line/E-LAN); MPLS/IP VPN; microwave radio link; satellite backhaul; legacy access network (E1, E&M, FXO, FXS, V.24).',
    unit: 'Per wavelength/month; per link/month; per site/month; per link once off/month; per terminal once off plus subscription; per port/link/month',
    tbd: false, rateZar: null },
  { ref: '32', tier: 4, name: 'Telecommunications Facilities & Infrastructure Services',
    description: 'Telecommunications room, rack and outdoor colocation; AC/DC power and battery-backup; telecommunications site access.',
    unit: 'Per rack/room/m²/month; per connection/month or metered usage; per site visit', tbd: false, rateZar: null },
  { ref: '33', tier: 4, name: 'Ad Hoc Installations',
    description: 'LAN point installations for ICT peripherals; CCTV installations for IP cameras and network video recorders.',
    unit: 'Per site', tbd: false, rateZar: null },

  // EXC-043-02 — all seven sub-services are TBD in the source.
  { ref: '34', tier: 4, name: 'Future Digital Telecommunication Services',
    description: 'DMR network access; LTE broadband and MCPTT; LTE and DMR hybrid interworking; DMR and LTE high-site coverage; mission-critical smart device; intelligent NOC and customer service assurance; smart port telecommunications and IoT connectivity.',
    unit: 'TBD', tbd: true, rateZar: null },

  { ref: '35', tier: 4, name: 'Emergency response services',
    description: 'Response to fire, chemical spills, derailments and other emergencies. Specialist vehicle, fire engine 3500L, water tanker, grass unit, incident command vehicle, first response vehicle; specialized fire equipment (decanting spade/Hetz pumps, DCP extinguishers, alco foam concentrates, oil cap, spillsorb, splash suits, SCBA); specialized labour (Chief/Senior/Fire Officer, Fire Fighter); water used.',
    unit: 'Per call-out (first 30 min) / per vehicle per hour; per unit; per extinguisher; per litre; per 10kg bag; per suit; per hour; per kl',
    tbd: false, rateZar: null },
  { ref: '36', tier: 4, name: 'Fire equipment maintenance services',
    description: 'Maintenance of 4.5kg and 9kg DCP, 5kg CO2, 9kg water and 9kg foam water extinguishers; fire hose reels; fire hydrants.',
    unit: 'Per extinguisher; per reel; per hydrant', tbd: false, rateZar: null },
  { ref: '37', tier: 4, name: 'Fire equipment and escape signage supply',
    description: 'Supply of fire equipment signage and supply/installation of escape signage (pair: item and arrow).',
    unit: 'Per pair', tbd: false, rateZar: null },
  { ref: '38', tier: 4, name: 'Technical support services (fire prevention and training)',
    description: 'Fire risk assessment; on-site evacuation drills/simulations and feedback; rail route risk assessment/profiling; lecture rooms; fire training grounds, drill yard, equipment and props.',
    unit: 'Per assessment; per drill/simulation; per site; per room per day; per day/per hour', tbd: false, rateZar: null },
  { ref: '39', tier: 4, name: 'Access to wayleaves',
    description: 'Processing and review of wayleave applications on or through TRIM infrastructure.',
    unit: 'Per application', tbd: false, rateZar: null },

  // EXC-043-02 — TBD in the source.
  { ref: '40', tier: 4, name: 'Staging',
    description: 'Leasing of underutilised rail lines within stations and yards for the temporary staging, parking, or idling of trains and rolling stock.',
    unit: 'TBD', tbd: true, rateZar: null },
];

export function ancillaryByRef(ref: string): AncillaryService | undefined {
  return ANCILLARY_SERVICES.find((s) => s.ref === ref);
}

export function servicesByTier(tier: AncillaryTier): AncillaryService[] {
  return ANCILLARY_SERVICES.filter((s) => s.tier === tier);
}

export function isPriced(service: AncillaryService): boolean {
  return service.rateZar != null;
}
