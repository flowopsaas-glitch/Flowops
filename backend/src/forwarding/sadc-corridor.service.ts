import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SADC CORRIDOR REFERENCE SERVICE
 *
 * Hand-compiled reference data for Southern African trade corridors and the
 * border posts on them - typical wait hours, transit days, fuel and toll
 * estimates, document requirements, reference risk bands. Built around the
 * Walvis Bay SADC Gateway port and the landlocked-country corridors it serves.
 *
 * Useful for planning a route. It says nothing about conditions right now.
 *
 * Corridors covered:
 * 1. Trans-Kalahari: Walvis Bay → Windhoek → Botswana → Johannesburg
 * 2. Trans-Caprivi: Walvis Bay → Windhoek → Zambia → DRC
 * 3. Maputo Corridor: Johannesburg → Maputo
 * 4. North-South: Durban → Zimbabwe → Zambia
 * 5. Nacala Corridor: Nacala → Malawi → Zambia
 * 6. Lobito Corridor: Lobito → DRC → Zambia
 * 7. Dar Corridor: Dar es Salaam → Zambia → DRC
 *
 * What it serves, and what it does not:
 * - typical (reference) wait hours per border post, and peak figures
 * - corridor transit-time, fuel and toll estimates
 * - a cost/time comparison across corridors and against Durban
 * - a reference congestion level per post
 * - required documents per border and per country
 * - a reference risk level per route
 *
 * NONE of that is observed. See PROVENANCE below.
 */

// ══════════════════════════════════════════════════════════════════════════
// PROVENANCE — read this before touching any number in this file
// ══════════════════════════════════════════════════════════════════════════
//
// Every figure below is hand-compiled REFERENCE data written into source: how a
// crossing or corridor typically behaves. It is not measured by FlowOps, not
// supplied by a border authority, and not a live feed. `congestionLevel` and
// `avgWaitHours` are not readings — nothing in this system observes a gate, and
// this header used to describe them as "real-time border congestion levels" and
// "border post wait-time intelligence", which is a claim the data cannot
// support.
//
// FlowOps could not measure them today even if it wanted to: the inspected portal GPS path does not retain a truck
// position history. `DriverPortalService.updateGps` overwrites
// `Driver.lastLat/lastLng/lastSeen` (one latest point), `LiveTrackingSession`
// holds one current point, and `RailTelemetryPoint` belongs to rail hardware. A broader source inventory remains necessary. Deriving a dwell session
// (entry to exit, then median/P90/n per post) needs position samples first. That
// work is WP3 — gated, unbuilt, planned in
// `docs/WP3-SADC-BORDER-DWELL-PLAN-2026-10-30.md`.
//
// `compiledAsOf` is null on purpose: when these figures were compiled is not
// recorded, and inventing a freshness stamp would be the same defect in a
// different shape. Set it only when somebody actually reviews the table.
//
// Every response this service returns carries the block below, so a
// programmatic consumer sees the same disclaimer the UI prints.

/** Provenance stamped on every response from this service. */
export interface ReferenceProvenance {
  /** Always STATIC_REFERENCE: the figures live in source, not in a feed. */
  source: 'STATIC_REFERENCE';
  /** Never observed by FlowOps. */
  observed: false;
  /** No FlowOps measurement pipeline feeds these numbers. */
  measuredByFlowOps: false;
  /** When the figures were last reviewed. Null: not recorded. */
  compiledAsOf: string | null;
  /** The sentence a UI should show next to the numbers. */
  basis: string;
}

export const SADC_REFERENCE_PROVENANCE: ReferenceProvenance = {
  source: 'STATIC_REFERENCE',
  observed: false,
  measuredByFlowOps: false,
  compiledAsOf: null,
  basis:
    'Hand-compiled reference figures for Southern African border posts and trade corridors. ' +
    'Not measured by FlowOps; source unrecorded and not a live feed: ' +
    'congestion levels and wait, transit and cost figures are unverified constants, ' +
    'not current observations. Source and review date not recorded.',
};

/** Attach the provenance block to a reference record without changing its shape. */
function withProvenance<T extends object>(row: T): T & { provenance: ReferenceProvenance } {
  return { ...row, provenance: SADC_REFERENCE_PROVENANCE };
}

// ══════════════════════════════════════════════════════════════════════════════
// BORDER POST DATABASE — reference figures for Southern African crossings
// ══════════════════════════════════════════════════════════════════════════════

export interface BorderPost {
  code: string;
  name: string;
  countries: [string, string]; // The two countries it connects
  lat: number;
  lng: number;
  avgWaitHours: number; // Commercial vehicle average
  peakWaitHours: number; // During busy periods
  operatingHours: string;
  is24Hour: boolean;
  requiredDocs: string[];
  /** Typical, not current: a reference band for this post (see PROVENANCE). */
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notes: string;
  /** Stamped on the way out by withProvenance(); absent from the source table. */
  provenance?: ReferenceProvenance;
}

const BORDER_POSTS: Record<string, BorderPost> = {
  'BEIT_BRIDGE': {
    code: 'BEIT_BRIDGE', name: 'Beit Bridge',
    countries: ['ZA', 'ZW'], lat: -22.2167, lng: 30.0000,
    avgWaitHours: 12, peakWaitHours: 48,
    operatingHours: '24/7', is24Hour: true,
    requiredDocs: ['passport', 'vehicle-registration', 'cross-border-permit', 'customs-declaration', 'fumigation-cert'],
    congestionLevel: 'CRITICAL',
    notes: 'Busiest SA border. New one-stop concept under construction. Expect severe delays Dec-Jan.',
  },
  'LEBOMBO_RESSANO': {
    code: 'LEBOMBO_RESSANO', name: 'Lebombo / Ressano Garcia',
    countries: ['ZA', 'MZ'], lat: -25.4833, lng: 31.9833,
    avgWaitHours: 4, peakWaitHours: 12,
    operatingHours: '06:00-24:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'cross-border-permit', 'customs-declaration'],
    congestionLevel: 'HIGH',
    notes: 'Primary SA-Mozambique crossing. Maputo corridor trucks.',
  },
  'KAZUNGULA': {
    code: 'KAZUNGULA', name: 'Kazungula Bridge',
    countries: ['BW', 'ZM'], lat: -17.7833, lng: 25.2667,
    avgWaitHours: 2, peakWaitHours: 8,
    operatingHours: '06:00-22:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'transit-permit', 'customs-declaration', 'yellow-fever-cert'],
    congestionLevel: 'LOW',
    notes: 'New bridge (2021). One-stop border post. Dramatically faster than Beit Bridge detour.',
  },
  'TRANS_KALAHARI': {
    code: 'TRANS_KALAHARI', name: 'Trans-Kalahari / Mamuno-Buitepos',
    countries: ['NA', 'BW'], lat: -23.5000, lng: 20.0000,
    avgWaitHours: 1.5, peakWaitHours: 4,
    operatingHours: '07:00-24:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'road-user-permit', 'customs-declaration'],
    congestionLevel: 'LOW',
    notes: 'Key SADC Gateway corridor. Low traffic. Fast processing.',
  },
  'PIONEER_GATE': {
    code: 'PIONEER_GATE', name: 'Pioneer Gate / Skilpadshek',
    countries: ['BW', 'ZA'], lat: -24.7500, lng: 26.9833,
    avgWaitHours: 3, peakWaitHours: 8,
    operatingHours: '06:00-22:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'cross-border-permit', 'customs-declaration'],
    congestionLevel: 'MEDIUM',
    notes: 'Trans-Kalahari corridor into SA. Gaborone route.',
  },
  'CHIRUNDU': {
    code: 'CHIRUNDU', name: 'Chirundu One-Stop',
    countries: ['ZM', 'ZW'], lat: -15.7333, lng: 28.8500,
    avgWaitHours: 6, peakWaitHours: 24,
    operatingHours: '24/7', is24Hour: true,
    requiredDocs: ['passport', 'vehicle-registration', 'transit-permit', 'customs-declaration', 'fumigation-cert'],
    congestionLevel: 'HIGH',
    notes: 'North-South corridor. First one-stop border post in Africa (2009).',
  },
  'KASUMBALESA': {
    code: 'KASUMBALESA', name: 'Kasumbalesa',
    countries: ['ZM', 'CD'], lat: -12.5833, lng: 28.5167,
    avgWaitHours: 18, peakWaitHours: 72,
    operatingHours: '06:00-18:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'transit-permit', 'customs-declaration', 'import-permit', 'fumigation-cert'],
    congestionLevel: 'CRITICAL',
    notes: 'DRC border — extremely slow. Copper belt traffic. Corruption risk HIGH.',
  },
  'WENELA_KATIMA': {
    code: 'WENELA_KATIMA', name: 'Wenela / Katima Mulilo',
    countries: ['NA', 'ZM'], lat: -17.8000, lng: 25.0333,
    avgWaitHours: 2, peakWaitHours: 6,
    operatingHours: '06:00-18:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'transit-permit', 'customs-declaration'],
    congestionLevel: 'LOW',
    notes: 'Trans-Caprivi corridor. Namibia to Zambia via Caprivi Strip.',
  },
  'NGOMA': {
    code: 'NGOMA', name: 'Ngoma Bridge',
    countries: ['NA', 'BW'], lat: -18.0167, lng: 24.7500,
    avgWaitHours: 1, peakWaitHours: 3,
    operatingHours: '06:00-18:00', is24Hour: false,
    requiredDocs: ['passport', 'vehicle-registration', 'road-user-permit'],
    congestionLevel: 'LOW',
    notes: 'Namibia to Botswana (Caprivi). Very quiet border.',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// TRADE CORRIDORS — Complete route definitions with waypoints
// ══════════════════════════════════════════════════════════════════════════════

export interface TradeCorridor {
  code: string;
  name: string;
  origin: string;
  destination: string;
  distanceKm: number;
  avgTransitDays: number;
  borderPosts: string[]; // Border post codes
  countries: string[];
  fuelCostEstimate: number; // USD per trip (one way)
  tollCostEstimate: number; // USD per trip
  /** Reference band, not an assessment of conditions today. */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  keyRisks: string[];
  alternativePort: string; // Which port is the alternative
  /** Stamped on the way out by withProvenance(); absent from the source table. */
  provenance?: ReferenceProvenance;
}

const CORRIDORS: Record<string, TradeCorridor> = {
  'TRANS_KALAHARI': {
    code: 'TRANS_KALAHARI',
    name: 'Trans-Kalahari Corridor',
    origin: 'Walvis Bay (NA)',
    destination: 'Johannesburg (ZA)',
    distanceKm: 1900,
    avgTransitDays: 3,
    borderPosts: ['TRANS_KALAHARI', 'PIONEER_GATE'],
    countries: ['NA', 'BW', 'ZA'],
    fuelCostEstimate: 1200,
    tollCostEstimate: 150,
    riskLevel: 'LOW',
    keyRisks: ['Limited fuel stops in Kalahari', 'Sand storms (seasonal)'],
    alternativePort: 'Durban (ZA) — 5 day transit, congested',
  },
  'TRANS_CAPRIVI': {
    code: 'TRANS_CAPRIVI',
    name: 'Trans-Caprivi Corridor',
    origin: 'Walvis Bay (NA)',
    destination: 'Lusaka (ZM)',
    distanceKm: 2500,
    avgTransitDays: 4,
    borderPosts: ['WENELA_KATIMA'],
    countries: ['NA', 'ZM'],
    fuelCostEstimate: 1500,
    tollCostEstimate: 80,
    riskLevel: 'MEDIUM',
    keyRisks: ['Caprivi Strip road quality variable', 'Limited services in rural Zambia'],
    alternativePort: 'Dar es Salaam (TZ) — 7 day transit, congested',
  },
  'WALVIS_BOTSWANA': {
    code: 'WALVIS_BOTSWANA',
    name: 'Walvis Bay → Botswana',
    origin: 'Walvis Bay (NA)',
    destination: 'Gaborone (BW)',
    distanceKm: 1600,
    avgTransitDays: 2.5,
    borderPosts: ['TRANS_KALAHARI'],
    countries: ['NA', 'BW'],
    fuelCostEstimate: 950,
    tollCostEstimate: 50,
    riskLevel: 'LOW',
    keyRisks: ['Trans-Kalahari road monotony (driver fatigue)'],
    alternativePort: 'Durban (ZA) via Beit Bridge — 4 days, HIGH congestion',
  },
  'WALVIS_DRC': {
    code: 'WALVIS_DRC',
    name: 'Walvis Bay → DRC (Copper Belt)',
    origin: 'Walvis Bay (NA)',
    destination: 'Lubumbashi (CD)',
    distanceKm: 3200,
    avgTransitDays: 6,
    borderPosts: ['WENELA_KATIMA', 'KASUMBALESA'],
    countries: ['NA', 'ZM', 'CD'],
    fuelCostEstimate: 2000,
    tollCostEstimate: 120,
    riskLevel: 'HIGH',
    keyRisks: ['Kasumbalesa border (18h+ wait)', 'DRC road quality', 'Security concerns', 'Corruption risk'],
    alternativePort: 'Dar es Salaam (TZ) — 7 days, also HIGH risk',
  },
  'NORTH_SOUTH': {
    code: 'NORTH_SOUTH',
    name: 'North-South Corridor',
    origin: 'Durban (ZA)',
    destination: 'Lusaka (ZM)',
    distanceKm: 2800,
    avgTransitDays: 5,
    borderPosts: ['BEIT_BRIDGE', 'CHIRUNDU'],
    countries: ['ZA', 'ZW', 'ZM'],
    fuelCostEstimate: 1700,
    tollCostEstimate: 200,
    riskLevel: 'HIGH',
    keyRisks: ['Beit Bridge (12h+ wait)', 'Zimbabwe fuel shortages', 'Chirundu congestion'],
    alternativePort: 'Walvis Bay via Trans-Caprivi — 4 days, LOW risk',
  },
  'MAPUTO_CORRIDOR': {
    code: 'MAPUTO_CORRIDOR',
    name: 'Maputo Corridor',
    origin: 'Johannesburg (ZA)',
    destination: 'Maputo Port (MZ)',
    distanceKm: 600,
    avgTransitDays: 1,
    borderPosts: ['LEBOMBO_RESSANO'],
    countries: ['ZA', 'MZ'],
    fuelCostEstimate: 400,
    tollCostEstimate: 80,
    riskLevel: 'MEDIUM',
    keyRisks: ['Lebombo border delays', 'N4 toll costs', 'Maputo port congestion'],
    alternativePort: 'Durban — 0 border crossings but port congestion',
  },
  'NACALA_CORRIDOR': {
    code: 'NACALA_CORRIDOR',
    name: 'Nacala Corridor',
    origin: 'Nacala Port (MZ)',
    destination: 'Lilongwe (MW)',
    distanceKm: 900,
    avgTransitDays: 2,
    borderPosts: [],
    countries: ['MZ', 'MW'],
    fuelCostEstimate: 550,
    tollCostEstimate: 30,
    riskLevel: 'MEDIUM',
    keyRisks: ['Road quality in Mozambique', 'Limited repair facilities'],
    alternativePort: 'Dar es Salaam via Mbeya — 4 days',
  },
};

@Injectable()
export class SadcCorridorService {
  private readonly logger = new Logger('SADC_CORRIDOR');

  constructor(private prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // 1. BORDER POSTS — reference figures (see PROVENANCE)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * All border posts with their REFERENCE congestion levels. The array shape is
   * unchanged (the API client checks Array.isArray); each row now carries its
   * provenance.
   */
  getAllBorderPosts(): BorderPost[] {
    return Object.values(BORDER_POSTS).map((bp) => withProvenance(bp));
  }

  /** Get a specific border post by code, with provenance. */
  getBorderPost(code: string): BorderPost | null {
    const bp = BORDER_POSTS[code.toUpperCase()];
    return bp ? withProvenance(bp) : null;
  }

  /** Get border posts between two countries, with provenance. */
  getBorderPostsBetween(country1: string, country2: string): BorderPost[] {
    return Object.values(BORDER_POSTS)
      .filter(bp =>
        (bp.countries[0] === country1.toUpperCase() && bp.countries[1] === country2.toUpperCase()) ||
        (bp.countries[0] === country2.toUpperCase() && bp.countries[1] === country1.toUpperCase()),
      )
      .map((bp) => withProvenance(bp));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CORRIDORS — reference route comparison
  // ══════════════════════════════════════════════════════════════════════════

  /** All trade corridors, each carrying its provenance. */
  getAllCorridors(): TradeCorridor[] {
    return Object.values(CORRIDORS).map((c) => withProvenance(c));
  }

  /** Get a specific corridor by code, with provenance. */
  getCorridor(code: string): TradeCorridor | null {
    const corridor = CORRIDORS[code.toUpperCase()];
    return corridor ? withProvenance(corridor) : null;
  }

  /**
   * Compare corridors for a given origin to destination.
   *
   * The ranking is arithmetic on reference figures: `totalBorderWaitHours` sums
   * each post's typical wait and `estimatedTotalDays` adds it to the corridor's
   * typical transit. "Best option" therefore means best on the reference table,
   * not fastest today — hence the provenance on the envelope and on every row.
   */
  compareCorridors(
    origin: string,
    destination: string,
  ): {
    corridors: (TradeCorridor & { totalBorderWaitHours: number; estimatedTotalDays: number; recommendation: string })[];
    bestOption: string;
    provenance: ReferenceProvenance;
  } {
    // Find corridors that serve this route
    const matching = Object.values(CORRIDORS).filter(c =>
      c.origin.toLowerCase().includes(origin.toLowerCase()) ||
      c.destination.toLowerCase().includes(destination.toLowerCase()) ||
      c.countries.includes(origin.toUpperCase()) ||
      c.countries.includes(destination.toUpperCase()),
    );

    const enriched = matching.map(corridor => {
      // Calculate total border wait time
      const totalBorderWaitHours = corridor.borderPosts.reduce((sum, bpCode) => {
        const bp = BORDER_POSTS[bpCode];
        return sum + (bp?.avgWaitHours || 0);
      }, 0);

      const estimatedTotalDays = corridor.avgTransitDays + (totalBorderWaitHours / 24);

      let recommendation = '';
      if (corridor.riskLevel === 'LOW' && totalBorderWaitHours < 4) recommendation = 'RECOMMENDED — Fast, low risk';
      else if (corridor.riskLevel === 'MEDIUM') recommendation = 'VIABLE — Moderate delays expected';
      else recommendation = 'HIGH RISK — Significant border delays likely';

      return {
        ...corridor,
        totalBorderWaitHours,
        estimatedTotalDays: Math.round(estimatedTotalDays * 10) / 10,
        recommendation,
        provenance: SADC_REFERENCE_PROVENANCE,
      };
    });

    // Sort by estimated total days (fastest first)
    enriched.sort((a, b) => a.estimatedTotalDays - b.estimatedTotalDays);

    return {
      corridors: enriched,
      bestOption: enriched[0]?.code || 'NONE',
      provenance: SADC_REFERENCE_PROVENANCE,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. WALVIS BAY vs DURBAN — Cost & time comparison
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compare routing via Walvis Bay SADC Gateway against Durban.
   *
   * Every input here is a reference figure chosen by destination, including the
   * port-wait constants below; the savings are differences between those
   * figures, not measured savings.
   */
  walvisBayVsDurban(destination: string): {
    walvisBay: { transitDays: number; portWait: number; borderWait: number; totalDays: number; cost: number; risk: string };
    durban: { transitDays: number; portWait: number; borderWait: number; totalDays: number; cost: number; risk: string };
    recommendation: string;
    savingsDays: number;
    savingsCost: number;
    provenance: ReferenceProvenance;
  } {
    const dest = destination.toUpperCase();

    // Walvis Bay route data
    let wbTransit = 3, wbBorder = 1.5, wbCost = 1200, wbRisk = 'LOW';
    let dbTransit = 5, dbBorder = 12, dbCost = 1700, dbRisk = 'HIGH';

    if (dest.includes('BW') || dest.includes('BOTSWANA') || dest.includes('GABORONE')) {
      wbTransit = 2.5; wbBorder = 1.5; wbCost = 950; wbRisk = 'LOW';
      dbTransit = 3; dbBorder = 0; dbCost = 800; dbRisk = 'LOW';
    } else if (dest.includes('ZM') || dest.includes('ZAMBIA') || dest.includes('LUSAKA')) {
      wbTransit = 4; wbBorder = 2; wbCost = 1500; wbRisk = 'MEDIUM';
      dbTransit = 5; dbBorder = 18; dbCost = 1700; dbRisk = 'HIGH';
    } else if (dest.includes('ZW') || dest.includes('ZIMBABWE') || dest.includes('HARARE')) {
      wbTransit = 3; wbBorder = 1.5; wbCost = 1300; wbRisk = 'LOW';
      dbTransit = 3; dbBorder = 12; dbCost = 1200; dbRisk = 'HIGH';
    } else if (dest.includes('CD') || dest.includes('DRC') || dest.includes('LUBUMBASHI')) {
      wbTransit = 6; wbBorder = 20; wbCost = 2000; wbRisk = 'HIGH';
      dbTransit = 7; dbBorder = 30; dbCost = 2200; dbRisk = 'CRITICAL';
    }

    // Reference constants, not port readings: nothing here observes a berth.
    const wbPortWait = 1.5; // Walvis Bay — treated as low congestion
    const dbPortWait = 3; // Durban — treated as congested

    const wbTotal = wbTransit + (wbPortWait / 24) + (wbBorder / 24);
    const dbTotal = dbTransit + (dbPortWait / 24) + (dbBorder / 24);

    const savingsDays = Math.round((dbTotal - wbTotal) * 10) / 10;
    const savingsCost = dbCost - wbCost;

    let recommendation = '';
    if (savingsDays > 1) recommendation = `Walvis Bay saves ${savingsDays} days — RECOMMENDED for ${destination}`;
    else if (savingsDays > 0) recommendation = `Walvis Bay slightly faster — consider based on sailing schedule`;
    else recommendation = `Durban is faster for this destination — but check port congestion`;

    return {
      walvisBay: { transitDays: wbTransit, portWait: wbPortWait, borderWait: wbBorder, totalDays: Math.round(wbTotal * 10) / 10, cost: wbCost, risk: wbRisk },
      durban: { transitDays: dbTransit, portWait: dbPortWait, borderWait: dbBorder, totalDays: Math.round(dbTotal * 10) / 10, cost: dbCost, risk: dbRisk },
      recommendation,
      savingsDays,
      savingsCost,
      provenance: SADC_REFERENCE_PROVENANCE,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. REQUIRED DOCUMENTS PER CORRIDOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Documents a corridor typically requires. Requirements are set by the
   * authorities and change without notice, so this list is reference material
   * to check against, not a clearance guarantee.
   */
  getRequiredDocuments(corridorCode: string): {
    corridor: string;
    documents: string[];
    borderDocs: Record<string, string[]>;
    provenance: ReferenceProvenance;
  } {
    const corridor = CORRIDORS[corridorCode.toUpperCase()];
    if (!corridor) {
      return {
        corridor: corridorCode,
        documents: [],
        borderDocs: {},
        provenance: SADC_REFERENCE_PROVENANCE,
      };
    }

    const baseDocs = [
      'commercial-invoice', 'packing-list', 'bill-of-lading',
      'certificate-of-origin', 'transit-bond',
    ];

    const borderDocs: Record<string, string[]> = {};
    for (const bpCode of corridor.borderPosts) {
      const bp = BORDER_POSTS[bpCode];
      if (bp) borderDocs[bp.name] = bp.requiredDocs;
    }

    // Country-specific additions
    const allDocs = [...baseDocs];
    if (corridor.countries.includes('ZA')) allDocs.push('sad500');
    if (corridor.countries.includes('ZW')) allDocs.push('zim-form47');
    if (corridor.countries.includes('MZ')) allDocs.push('mozambique-jue');
    if (corridor.countries.includes('BW')) allDocs.push('botswana-burs');
    if (corridor.countries.includes('ZM')) allDocs.push('zambia-zra-entry');
    if (corridor.countries.includes('CD')) allDocs.push('drc-dgda');
    if (corridor.countries.includes('KE')) allDocs.push('kenya-c17');
    if (corridor.countries.includes('TZ')) allDocs.push('tanzania-tancis');

    return {
      corridor: corridor.name,
      documents: [...new Set(allDocs)],
      borderDocs,
      provenance: SADC_REFERENCE_PROVENANCE,
    };
  }
}
