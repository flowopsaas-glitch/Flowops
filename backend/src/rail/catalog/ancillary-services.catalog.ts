/**
 * Annexure 40 — TRIM Ancillary Services Catalogue 2026/27.
 * Source: "ANNEXURE 40 — TRIM ANCILLARY SERVICES CATALOGUE 2026/27", supplied by the
 * project owner on 2026-10-02. 40 numbered services in 4 tiers.
 *
 * THE ANNEXURE PUBLISHES NO PRICES — only a unit of measure for each line, and `TBD` for
 * Staging and every Future Digital service (proposed EXC-025 reading: "TBD" is not zero
 * and not free). So `unitRateZar` is intentionally absent here; a rate is only ever
 * loaded from a published tariff, never defaulted.
 *
 * Several services contain several priced lines (e.g. 4a–4d, the three fibre lines of 26,
 * the nine radio lines of 30). Each LINE gets its own code so it can be priced and billed
 * on its own: `ANX40-NN` for a one-line service, `ANX40-NN-kk` for the kk-th line of a
 * multi-line service, in source order.
 *
 * Unit-of-measure text is verbatim, including the source's spelling (e.g. "30mnts").
 */

export type AncillaryTier = 1 | 2 | 3 | 4;
export type AncillaryGroup = 'RAIL' | 'TELECOMS' | 'SAFETY_EMERGENCY' | 'PROPERTY';
/** NOT_PUBLISHED / TBD are the two states the annexure itself uses; PUBLISHED is only for a rate loaded from a cited published tariff. */
export type AncillaryPriceStatus = 'NOT_PUBLISHED' | 'TBD' | 'PUBLISHED';

export interface AncillaryServiceLine {
  code: string;
  serviceNumber: number;
  /** Heading of the numbered service. */
  serviceName: string;
  /** This line's own name (= serviceName for single-line services). */
  name: string;
  /** Label printed in the source (a, b, c, d) when the source labels the lines. */
  sourceLabel?: string;
  /** Sub-heading the line sits under (e.g. "Installation of Transmission links"). */
  section?: string;
  description?: string;
  /** Unit of Measure, verbatim. */
  unitOfMeasure: string;
  tier: AncillaryTier;
  tierName: string;
  group: AncillaryGroup;
  /** Tier 1 is described as "Safety critical and compulsory services". */
  isCompulsory: boolean;
  priceStatus: AncillaryPriceStatus;
  /** ONLY when priceStatus is PUBLISHED: ZAR per unit of measure. Absent for every line in the annexure as supplied. */
  unitRateZar?: number;
  /** ONLY when priceStatus is PUBLISHED: the published tariff the rate was taken from. */
  rateSourceRef?: string;
}

export const ANNEXURE_40_VERSION = '2026/27';

const TIER_NAMES: Record<AncillaryTier, string> = {
  1: 'INFRASTRUCTURE ACCESS SERVICES',
  2: 'RAIL CRITICAL SUPPORT SERVICES',
  3: 'OPTIONAL RAIL SUPPORT SERVICES',
  4: 'NON RAIL SERVICE',
};

interface RawLine { name: string; uom: string; description?: string; label?: string; section?: string }
interface RawService {
  n: number;
  title: string;
  tier: AncillaryTier;
  group: AncillaryGroup;
  /** Single-line service. */
  uom?: string;
  description?: string;
  /** Multi-line service. */
  lines?: RawLine[];
}

const PER_CALLOUT = 'Per call-out (first 30mnts) / Per vehicle per hour';

const RAW: RawService[] = [
  // ── TIER 1 ─────────────────────────────────────────────────────────────────
  { n: 1, tier: 1, group: 'RAIL', title: 'Yards: Shunting and marshalling services (List of Yards.xlsx)',
    description: 'Provision of ancillary facilities services such as shunting, staging, inspections, assembling and dispatching trains, including the use of waiting rooms and ablution facilities for TOC crews, where available.',
    uom: 'Per wagon movement (varies per train category: GF <50 wagons; Medium heavy >50 <100; heavy >100)' },
  { n: 2, tier: 1, group: 'RAIL', title: 'Inland terminals: Handling of containerized cargo for modal transfers from road to rail (List of Terminals.xlsx)',
    description: 'Provision of containerized cargo handling and modal transfers services at TRIM owned inland terminals. Fee includes access to and use of waiting rooms and ablution facilities where available.',
    uom: 'Per container handled' },
  { n: 3, tier: 1, group: 'RAIL', title: 'Radio network (Trunk & Open Channel): Radio support services for compulsory onboard train communications',
    description: 'Managed access to TRIM radio network services, including agreed user access, radio subscription packages and service availability support where applicable.',
    uom: 'Per Radio (monthly subscription)' },
  { n: 4, tier: 1, group: 'RAIL', title: 'Radio Network Supporting Peripherals (Train Radios, Handheld Radios, Telemeters, Radio Cab Systems, incl. Integrated Onboard Operating System)',
    lines: [
      { label: 'a', name: 'Radio & Telemeter Compliance Testing and Acceptance Support', uom: 'Per Device',
        description: 'Batch compliance testing, configuration checks and acceptance testing of TOC radios to verify technical compliance and compatibility with the TRIM radio network.' },
      { label: 'b', name: 'Radio & Telemeter Programming and Configuration Support', uom: 'Per Device',
        description: 'Technical support for radio programming, code plug control, configuration checks and approved user profiles.' },
      { label: 'c', name: 'TOC Radio Onboarding and Activation', uom: 'Per radio',
        description: 'Registration, configuration verification, subscriber activation and controlled connection of TOC radios to the TRIM radio network.' },
      { label: 'd', name: 'Train Radio Box and locomotive handset installation and commissioning', uom: 'Per locomotive',
        description: 'Installation, interface verification, antenna and power checks, functional testing and operational acceptance of approved RTB and locomotive radio handset equipment.' },
    ] },
  // ── TIER 2 ─────────────────────────────────────────────────────────────────
  { n: 5, tier: 2, group: 'RAIL', title: 'Track and trace data',
    description: "Provision of real-time location and movement tracking services for TOC rolling stock through TRIM's Vehicle Identification System (VIS) and CS90 platforms.", uom: 'Per month' },
  { n: 6, tier: 2, group: 'RAIL', title: 'Rolling stock condition data',
    description: "Provision of condition monitoring data from TRIM's wayside systems (Wheel Profile Monitor, Acoustic Bearing Evaluator, Weigh-in-Motion, etc.) for TOC rolling stock maintenance planning purposes.", uom: 'Per month' },
  { n: 7, tier: 2, group: 'RAIL', title: 'Locomotive pantograph monitoring data',
    description: "Access to data from continuous monitoring and assessment of TOC's locomotive pantographs to ensure safe interaction with overhead traction equipment (OHTE).", uom: 'Per loco per month' },
  { n: 8, tier: 2, group: 'RAIL', title: 'Evaluation of new rolling stock',
    description: 'Comprehensive assessment of new locomotives or wagons to determine safety and technical compatibility on TRIM network.', uom: 'Per certificate (certificate for each wagon/loco)' },
  // ── TIER 3 ─────────────────────────────────────────────────────────────────
  { n: 9, tier: 3, group: 'RAIL', title: 'Engineering and technical reviews of rail related project proposals',
    description: 'Review and validation of external rail infrastructure designs and technologies - Private sidings, private or concessioned rail lines, substations, new operating philosophies', uom: 'Per hour' },
  { n: 10, tier: 3, group: 'RAIL', title: 'Weigh bridge calibration test train rental (wagons)', description: 'Rental of weigh bridge calibration test train (wagons)', uom: 'Per wagon per hour' },
  { n: 11, tier: 3, group: 'RAIL', title: 'Business case reviews and support',
    description: 'Provision of professional support to develop, assess, and validate business cases for rail-related projects', uom: 'Per hour' },
  { n: 12, tier: 3, group: 'RAIL', title: 'Weigh bridge repair, calibration and validation',
    description: 'Technical services for calibration, repair and certification of private sidings weighbridges to ensure accuracy and compliance with national standards', uom: 'Per certificate (1 certificate per weighbridge)' },
  { n: 13, tier: 3, group: 'RAIL', title: 'Rail construction consultancy', description: 'Provision of pre-construction support services for third-party rail projects', uom: 'Per hour' },
  { n: 14, tier: 3, group: 'RAIL', title: 'Rail infrastructure specifications',
    description: "Provision of access to TRIM's standardized rail infrastructure technical specifications (track, signalling, telecoms, yards, depots, etc.) for use by industry participants, contractors, and concessionaires",
    uom: 'Subscription Per annum (Fee covers all revisions in that year)' },
  { n: 15, tier: 3, group: 'RAIL', title: 'Private siding inspections', description: 'Inspections of private sidings to ensure safety and operational compliance', uom: 'Per inspection' },
  { n: 16, tier: 3, group: 'RAIL', title: 'Applications for new or upgraded level crossings',
    description: 'Processing and engineering reviews of level crossing applications for upgrades or new developments', uom: 'Per application' },
  { n: 17, tier: 3, group: 'RAIL', title: 'Quality assurance, testing and commissioning',
    description: 'Specialist testing and commissioning of rail infrastructure and equipment', uom: 'Per certificate' },
  { n: 18, tier: 3, group: 'RAIL', title: 'Rental of cabooses', description: "Rental of TRIM cabooses to TOC's and third parties", uom: 'Per caboose/day' },
  { n: 19, tier: 3, group: 'RAIL', title: 'Electrical network capacity analysis',
    description: 'Electrical network planning, conducting capacity and electrical performance simulations', uom: 'Per request' },
  { n: 20, tier: 3, group: 'RAIL', title: 'Electrical protection review and issuing settings',
    description: 'Conducting electrical protection analysis and issuing protection settings', uom: 'Per application' },
  { n: 21, tier: 3, group: 'RAIL', title: 'OHTE mechanized condition assessments', description: 'Conducting mechanized condition assessments of OHTE', uom: 'Per run' },
  { n: 22, tier: 3, group: 'RAIL', title: 'Technical investigations', description: 'Investigation of failures', uom: 'Per request' },
  { n: 23, tier: 3, group: 'RAIL', title: 'Pantograph and roof equipment inspection',
    description: 'Inspecting electrical locomotive pantograph and roof equipment', uom: 'Per locomotive' },
  { n: 24, tier: 3, group: 'RAIL', title: 'Electrical energy performance analysis',
    description: 'Provision of electrical energy performance analysis for locomotives and buildings', uom: 'Per request' },
  { n: 25, tier: 3, group: 'RAIL', title: 'Electrical Systems and Technology Audits',
    description: 'Auditing of electrical equipment, systems and technology to determine useful lifecycle and asset value', uom: 'Per request' },
  // ── TIER 4 — TELECOMS ──────────────────────────────────────────────────────
  { n: 26, tier: 4, group: 'TELECOMS', title: 'Unlit dark optic fiber National Long Distance (50 - 1000km)',
    lines: [
      { name: 'Installation of dark optical fibre cables NLD (50-1000km) for Leasing', uom: 'Per installation (once off)' },
      { name: 'Leasing of dark optical fibre cables NLD (50-1000km)', uom: 'Per month (usage)' },
      { name: 'Maintenance of leased fibre links to ensure operational integrity (NLD) 50-1000km', uom: 'Per km/month' },
    ] },
  { n: 27, tier: 4, group: 'TELECOMS', title: 'Dark optic fibre Metro (0 - 50km)',
    lines: [
      { name: 'Installation of dark optical fibre cables (Metro) 0-50km for leasing', uom: 'Per installation (once off)' },
      { name: 'Leasing of dark optical fibre cables (Metro) 0-50km for leasing', uom: 'Per month (usage)' },
      { name: 'Maintenance of leased fibre links to ensure operational integrity (Metro) 0-50km', uom: 'Per km/month' },
      { section: 'Installation of Transmission links', name: 'Digital transmission link with a capacity of 2.048 Mbps (E1)', uom: 'Per Month (usage)' },
      { section: 'Installation of Transmission links', name: 'Synchronous Transport Module level 1 (STM-1) 155.52 Mbps', uom: 'Per Month (usage)' },
      { section: 'Installation of Transmission links', name: 'Synchronous Transport Module level 1 (STM-4) 622.080 Mbit/s or 622 Mbps', uom: 'Per Month (usage)' },
      { section: 'Installation of Transmission links', name: 'Synchronous Transport Module level 1 (STM-16) 2.5 gigabits per second (2,488.320 Mbit/s)', uom: 'Per Month (usage)' },
      { section: 'Installation of Transmission links', name: 'Synchronous Transport Module level 1 (STM-64) 10 Gigabits per second (10 Gbps)', uom: 'Per Month (usage)' },
      { section: 'Installation of Transmission links', name: 'Installation of any single transmission link from the list above', uom: 'Per link (Once off)' },
      { section: 'Data Transmission Speed packages', name: '1 Gbps', uom: 'Per month' },
      { section: 'Data Transmission Speed packages', name: '2,5 Gbps', uom: 'Per month' },
      { section: 'Data Transmission Speed packages', name: '5 Gbps', uom: 'Per month' },
      { section: 'Data Transmission Speed packages', name: '10 Gbps', uom: 'Per month' },
    ] },
  { n: 28, tier: 4, group: 'TELECOMS', title: 'Dark fibre support services - real estate: Rental of physical space for telecoms equipment',
    lines: [
      { name: 'Space in Comms Room 3 X 3', uom: 'Per room/month' },
      { name: 'Utilities (electricity) MRC', uom: 'Per room/month' },
      { name: 'Site Access', uom: 'Per site visit' },
    ] },
  { n: 29, tier: 4, group: 'TELECOMS', title: 'Installation of non-TRIM optic fibre cables',
    lines: [
      { name: 'Underground Fiber installation', uom: 'Per meter' },
      { name: 'Overhead Fiber installation', uom: 'Per meter' },
    ] },
  { n: 30, tier: 4, group: 'TELECOMS', title: 'Radio & Wireless Communication Services',
    lines: [
      { name: 'Enterprise and non-rail radio network access', uom: 'Per radio/month',
        description: 'Managed access and subscription to available TRIM radio network services for approved users outside compulsory train communication arrangements.' },
      { name: 'UHF/VHF fixed base station and repeater deployment', uom: 'Per site/project',
        description: 'Supply, installation, configuration and commissioning of approved fixed base stations, standalone repeaters and local coverage systems.' },
      { name: 'UHF/VHF handheld and mobile radio service', uom: 'Per unit',
        description: 'Supply, configuration, commissioning and support of approved handheld, vehicle-mounted and mobile radios for operational users.' },
      { name: 'Intrinsically safe radio service', uom: 'Per unit',
        description: 'Supply, configuration and commissioning of approved intrinsically safe UHF or VHF radios for hazardous and controlled environments.' },
      { name: 'Marine VHF communication service', uom: 'Per unit/site',
        description: 'Supply, installation, configuration and support of approved marine VHF fixed, handheld and mobile radio equipment for harbour and vessel operations.' },
      { name: 'Radio high-site co-location service', uom: 'Per site/month',
        description: 'Approved hosting of customer radio or telecommunications equipment, antennas and backhaul at TRIM high sites, subject to space, RF, structural, security and access approval.' },
      { name: 'Port terminal wireless and Navis connectivity support', uom: 'Per terminal/month',
        description: 'Wireless access, coverage assurance and network fault support for approved terminal devices and Navis application connectivity, excluding ownership of the Navis application.' },
      { name: 'Managed Wi-Fi, access point, controller, wireless gateway and associated backhaul services for port operational areas and modern mobile terminals', uom: 'Per access point/site/month' },
      { name: 'Narrowband wireless gateway and repeater support for TOC port operations', uom: 'Per gateway or repeater/month',
        description: 'Configuration, coverage assurance and fault support for approved legacy wireless gateways and repeaters serving TOC terminal devices in port operational areas.' },
    ] },
  { n: 31, tier: 4, group: 'TELECOMS', title: 'Transmission & Data Connectivity Services',
    lines: [
      { name: 'Dedicated wavelength service', uom: 'Per wavelength/month',
        description: 'Dedicated optical wavelength delivered over available DWDM infrastructure, with optional route protection and capacities such as 10G, 100G or 400G.' },
      { name: 'Managed wavelength service', uom: 'Per wavelength/month',
        description: 'Managed optical transport with monitoring, protection options and defined service levels for high-capacity customer applications.' },
      { name: 'DWDM/OTN managed transport service', uom: 'Per link/month',
        description: 'Managed optical transport with grooming, protection switching, performance monitoring and high-capacity backbone connectivity.' },
      { name: 'Carrier Ethernet service (E-Line/E-LAN)', uom: 'Per link/month',
        description: 'Layer 2 metro or long-haul Ethernet connectivity with agreed committed and excess information rates.' },
      { name: 'MPLS/IP VPN service', uom: 'Per site/month',
        description: 'Private Layer 3 IP connectivity with QoS, traffic separation and enterprise or operational service levels.' },
      { name: 'Microwave radio link service', uom: 'Per link once off/month',
        description: 'Licensed or unlicensed microwave access and backhaul, including path design, equipment installation, alignment and optional managed support.' },
      { name: 'Satellite backhaul service', uom: 'Per terminal once off plus subscription',
        description: 'LEO or MEO satellite connectivity for remote operations, temporary sites, disaster recovery and emergency communications.' },
      { name: 'Legacy access network service', uom: 'Per port/link/month',
        description: 'Provision and maintenance of E1, E&M, FXO, FXS and V.24 interfaces for legacy rail, industrial and voice-grade applications.' },
    ] },
  { n: 32, tier: 4, group: 'TELECOMS', title: 'Telecommunication Facilities & Infrastructure Services',
    lines: [
      { name: 'Telecommunications room, rack and outdoor colocation', uom: 'Per rack/room/m²/month',
        description: 'Secure room, rack, floor or outdoor space for approved customer telecommunications equipment at available TRIM facilities.' },
      { name: 'AC/DC power and battery-backup service', uom: 'Per connection/month or metered usage',
        description: 'Provision of metered AC power, DC rectifier capacity and optional battery backup for approved co-located telecommunications equipment.' },
      { name: 'Telecommunications site access service', uom: 'Per site visit',
        description: 'Controlled site access for authorised customer or service-provider personnel to inspect, install or maintain approved equipment.' },
    ] },
  { n: 33, tier: 4, group: 'TELECOMS', title: 'Ad Hoc Installations',
    lines: [
      { name: 'Lan Point Installations', uom: 'Per Site', description: 'Connectivity for ICT peripherals (Computers, network devices, WIFI access points, etc.)' },
      { name: 'CCTV Installations', uom: 'Per Site', description: 'Installation of CCTV equipment for IP cameras, network video recorders' },
    ] },
  { n: 34, tier: 4, group: 'TELECOMS', title: 'Future Digital Telecommunication Services',
    lines: [
      { name: 'DMR network access service', uom: 'TBD', description: 'Future DMR Tier II operational voice service supporting group calls, digital migration and approved mission-critical rail communication use cases.' },
      { name: 'LTE broadband and MCPTT service', uom: 'TBD', description: 'Future LTE service supporting operational broadband, data, video, IoT and mission-critical push-to-talk applications.' },
      { name: 'LTE and DMR hybrid interworking service', uom: 'TBD', description: 'Future dual-infrastructure or interworking capability to support resilience, interoperability and phased migration from legacy radio systems.' },
      { name: 'DMR and LTE high-site coverage service', uom: 'TBD', description: 'Future high-site radio and broadband coverage service supporting DMR voice and LTE operational applications.' },
      { name: 'Mission-critical smart device service', uom: 'TBD', description: 'Future approved LTE handheld or smart-device connectivity for operational voice, video, data and mobile applications.' },
      { name: 'Intelligent NOC and customer service assurance', uom: 'TBD', description: 'Future customer dashboards, alarm correlation, SLA reporting, incident visibility and coordinated monitoring across radio, transmission and wireless services.' },
      { name: 'Smart port telecommunications and IoT connectivity', uom: 'TBD', description: 'Future managed wireless, IoT, video and operational data connectivity supporting smart-port applications and analytics.' },
    ] },
  // ── TIER 4 — SAFETY AND EMERGENCY SERVICES ─────────────────────────────────
  { n: 35, tier: 4, group: 'SAFETY_EMERGENCY', title: 'Emergency response services to fire, chemicals spills, derailments and other emergencies.',
    lines: [
      { name: 'Use of specialist vehicle', uom: PER_CALLOUT },
      { name: 'Use of Fire Engine 3500 litres', uom: PER_CALLOUT },
      { name: 'Use of Water tanker', uom: PER_CALLOUT },
      { name: 'Use of Grass unit', uom: PER_CALLOUT },
      { name: 'Use of Incident Command vehicle / response vehicle', uom: PER_CALLOUT },
      { name: 'Use of First response vehicle', uom: PER_CALLOUT },
      { section: 'Use of specialized fire equipment', name: 'Decanting spade pump', uom: 'Per unit' },
      { section: 'Use of specialized fire equipment', name: 'Decanting Hetz pump', uom: 'Per unit' },
      { section: 'Use of specialized fire equipment', name: 'Fire extinguishers (dcp)', uom: 'Per extinguisher' },
      { section: 'Use of specialized fire equipment', name: 'Alco foam concentrates', uom: 'Per litre' },
      { section: 'Use of specialized fire equipment', name: 'Oil cap', uom: 'Per litre' },
      { section: 'Use of specialized fire equipment', name: 'Spillsorb', uom: 'Per 10 kg bag' },
      { section: 'Use of specialized fire equipment', name: 'Splash suite', uom: 'Per suit' },
      { section: 'Use of specialized fire equipment', name: 'Scba - Self-Contained Breathing Apparatus', uom: 'Per unit' },
      { section: 'Specialized Labour', name: 'Labour - Chief Fire Officer', uom: 'Per hour' },
      { section: 'Specialized Labour', name: 'Labour - Senior Fire Officer', uom: 'Per hour' },
      { section: 'Specialized Labour', name: 'Labour - Fire Officer', uom: 'Per hour' },
      { section: 'Specialized Labour', name: 'Labour - Fire Fighter', uom: 'Per hour' },
      { section: 'Specialized Labour', name: 'Water used', uom: 'Per kl' },
    ] },
  { n: 36, tier: 4, group: 'SAFETY_EMERGENCY', title: 'Fire equipment maintenance services',
    lines: [
      { name: 'Maintenance of 4,5 kg DCP Fire Extinguisher', uom: 'Per extinguisher' },
      { name: 'Maintenance of 9 kg DCP Fire Extinguisher', uom: 'Per extinguisher' },
      { name: 'Maintenance of 5 kg Co2 Fire Extinguisher', uom: 'Per extinguisher' },
      { name: 'Maintenance of 9 kg Water Fire Extinguisher', uom: 'Per extinguisher' },
      { name: 'Maintenance of 9 kg Foam Water Fire Extinguishers', uom: 'Per extinguisher' },
      { name: 'Maintenance of Fire Hose Reels', uom: 'Per reel' },
      { name: 'Maintenance of Fire Hydrants', uom: 'Per hydrant' },
    ] },
  { n: 37, tier: 4, group: 'SAFETY_EMERGENCY', title: 'Fire equipment and escape signages supply services',
    lines: [
      { name: 'Supply of Fire equipment Signages (Pair - item and Arrow)', uom: 'Per pair' },
      { name: 'Supply and installation of escape signages (Pair - item and Arrow)', uom: 'Per pair' },
    ] },
  { n: 38, tier: 4, group: 'SAFETY_EMERGENCY', title: 'Technical support services: Provision of fire prevention support services and training equipment.',
    lines: [
      { name: 'Provision of Fire Risk Assessment', uom: 'Per assessment' },
      { name: 'On site evacuation drills / Simulations and feedback', uom: 'Per drill/simulation' },
      { name: 'Rail Route Risk Assessment/Profiling', uom: 'Per site' },
      { name: 'Lecture rooms etc. per day or part thereof', uom: 'Per room per day' },
      { name: 'Fire training grounds, drill yard, equipment and props etc. for practical fire training/drills and demonstrations per day or part thereof (NEW)', uom: 'Per day/per hour' },
    ] },
  // ── TIER 4 — PROPERTY ──────────────────────────────────────────────────────
  { n: 39, tier: 4, group: 'PROPERTY', title: 'Access to wayleaves',
    description: 'Processing and review of wayleave applications on or through TRIM infrastructure', uom: 'Per application' },
  { n: 40, tier: 4, group: 'PROPERTY', title: 'Staging',
    description: 'Leasing of underutilised rail lines within stations and yards for the temporary staging, parking, or idling of trains and rolling stock.', uom: 'TBD' },
];

function flatten(): AncillaryServiceLine[] {
  const out: AncillaryServiceLine[] = [];
  for (const s of RAW) {
    const base = {
      serviceNumber: s.n, serviceName: s.title, tier: s.tier, tierName: TIER_NAMES[s.tier], group: s.group,
      isCompulsory: s.tier === 1,
    };
    const nn = String(s.n).padStart(2, '0');
    if (s.lines) {
      s.lines.forEach((l, i) => {
        out.push({
          ...base, code: `ANX40-${nn}-${String(i + 1).padStart(2, '0')}`, name: l.name,
          ...(l.label ? { sourceLabel: l.label } : {}), ...(l.section ? { section: l.section } : {}),
          ...(l.description ? { description: l.description } : {}),
          unitOfMeasure: l.uom, priceStatus: l.uom === 'TBD' ? 'TBD' : 'NOT_PUBLISHED',
        });
      });
    } else {
      out.push({
        ...base, code: `ANX40-${nn}`, name: s.title, ...(s.description ? { description: s.description } : {}),
        unitOfMeasure: s.uom as string, priceStatus: s.uom === 'TBD' ? 'TBD' : 'NOT_PUBLISHED',
      });
    }
  }
  return out;
}

/** Every priced line of Annexure 40 (40 numbered services → one or more lines each). */
export const ANCILLARY_SERVICE_CATALOG: readonly AncillaryServiceLine[] = flatten();

export function findAncillaryService(code: string): AncillaryServiceLine | undefined {
  return ANCILLARY_SERVICE_CATALOG.find((s) => s.code === code);
}

const ANCILLARY_GROUPS: readonly AncillaryGroup[] = ['RAIL', 'TELECOMS', 'SAFETY_EMERGENCY', 'PROPERTY'];

/**
 * Returns a list of problems; empty means the line may be seeded. A rate is only accepted together with the published
 * tariff it came from: `TBD` and "not published" are never a price, and a price is never present without its source.
 */
export function validateAncillaryServiceEntry(e: AncillaryServiceLine): string[] {
  const p: string[] = [];
  if (!/^ANX40-\d{2}(-\d{2})?$/.test(e.code)) p.push(`code "${e.code}" must look like ANX40-04 or ANX40-04-02`);
  if (!Number.isInteger(e.serviceNumber) || e.serviceNumber < 1 || e.serviceNumber > 40) p.push('serviceNumber must be 1-40');
  else if (!e.code.startsWith(`ANX40-${String(e.serviceNumber).padStart(2, '0')}`)) p.push(`code ${e.code} does not match serviceNumber ${e.serviceNumber}`);
  if (!e.serviceName?.trim() || !e.name?.trim()) p.push('serviceName and name are required');
  if (!e.unitOfMeasure?.trim()) p.push('unitOfMeasure is required (the annexure gives one for every line)');
  if (![1, 2, 3, 4].includes(e.tier)) p.push('tier must be 1-4');
  if (!ANCILLARY_GROUPS.includes(e.group)) p.push(`group "${e.group}" is not one of ${ANCILLARY_GROUPS.join('/')}`);
  if (!['NOT_PUBLISHED', 'TBD', 'PUBLISHED'].includes(e.priceStatus)) p.push(`priceStatus "${e.priceStatus}" is not one of NOT_PUBLISHED/TBD/PUBLISHED`);
  if (e.priceStatus === 'PUBLISHED') {
    if (typeof e.unitRateZar !== 'number' || !Number.isFinite(e.unitRateZar) || e.unitRateZar < 0) p.push('a PUBLISHED line needs a finite, non-negative unitRateZar');
    if (!e.rateSourceRef?.trim()) p.push('a PUBLISHED line needs rateSourceRef (the published tariff the rate came from)');
  } else {
    if (e.unitRateZar !== undefined) p.push(`a ${e.priceStatus} line must not carry a unitRateZar (TBD is not zero and not a price)`);
    if (e.rateSourceRef !== undefined) p.push(`a ${e.priceStatus} line must not carry a rateSourceRef`);
  }
  return p;
}
