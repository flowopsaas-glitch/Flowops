/**
 * TRIM Annexure 43 — KPI framework, baselines and targets.
 *
 * Source: docs/TRIM-ANNEXURE-43-40-SUPPLIED-SOURCE-2026-10-04.md
 * Supplied by the owner 2026-10-04. Network Statement V4, FY2026/27.
 *
 * Three rules govern everything here, and they exist because the source is
 * ambiguous in specific, recorded ways:
 *
 *   1. ABSENT is null, never 0. The Johannesburg-Cape Town sheet arrived
 *      truncated, so three of its KPIs have no value. Rendering them as zero
 *      would claim the corridor has perfect track condition.
 *
 *   2. TQI polarity is UNKNOWN. Six of seven corridors set a HIGHER target
 *      than baseline, and every one of them says "TQI within range". In some
 *      published track-quality conventions a lower index is better, which
 *      would make six of these targets regressions. TRIM does not state the
 *      polarity, so no green/red judgement is rendered on TQI - see
 *      EXC-043-06. lowerIsBetter is null for it, and null means "do not judge".
 *
 *   3. The source's own comment text is not rendered as fact. Several
 *      "100% reduction" comments contradict the baseline/target pair beside
 *      them; the numbers are authoritative, the prose is not (EXC-043-04).
 */

/** Direction of goodness. null = the source does not say, so do not judge. */
export type KpiPolarity = 'lowerIsBetter' | 'higherIsBetter' | null;

export type KpiCategory =
  | 'TRANSIT_SPEEDS'
  | 'TRACK_SERVICE_QUALITY'
  | 'TRACK_CONDITION'
  | 'RELIABILITY'
  | 'DELAY_ATTRIBUTION'
  | 'SLOT_MODIFICATION'
  | 'IM_NON_COMPLIANCE'
  | 'TOC_NON_USAGE'
  | 'IM_UNIT_COSTS';

export type Attribution = 'IM' | 'TOC' | 'IM+TOC';

/** A KPI defined by the framework but with no per-corridor figures yet. */
export interface KpiDefinition {
  id: string;
  category: KpiCategory;
  measure: string;
  unit: string;
  attribution: Attribution;
  frequency: string;
  /** Sheet 1 (future) vs Sheet 2 (current). */
  framework: 'future' | 'current';
  /** True when TRIM records this as not yet measurable. */
  notYetMeasured?: boolean;
  note?: string;
}

/**
 * A measured target for one KPI on one corridor.
 *
 * baseline and target are raw strings straight from the workbook ("2.50%",
 * "27:07", "0.97", "N/A"). They are kept verbatim because normalising them
 * lossily would destroy the audit trail; use the parse helpers instead.
 */
export interface KpiTarget {
  kpi: string;
  baseline: string | null;
  target: string | null;
  /** Verbatim source comment. Unreliable - see EXC-043-04. */
  comment?: string;
}

export interface CorridorKpis {
  id: string;
  /** Sheet title from the workbook. */
  sheet: string;
  name: string;
  /** Sheet 12 was truncated; its TRACK CONDITION block is missing entirely. */
  incomplete: boolean;
  kpis: KpiTarget[];
}

// ── parsing ─────────────────────────────────────────────────────────────────

/**
 * "27:07" -> 1627 minutes.
 *
 * Transit times are hh:mm and must be compared as durations, not strings:
 * "9:30" sorts after "10:00" lexically while being a shorter journey.
 */
export function parseDuration(raw: string | null): number | null {
  if (raw == null) return null;
  const m = /^(\d+):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 1627 -> "27:07". Inverse of parseDuration, for display. */
export function formatDuration(minutes: number | null): string | null {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * "2.50%" -> 0.025 ; "0.97" -> 0.97 ; "94%" -> 0.94.
 *
 * The source mixes percentages and decimals for the SAME KPI on different
 * corridors (EXC-043-05): Traction Substation Availability is "94%" on
 * Manganese and "0.87" on Lephalale. Anything above 1 is read as a percentage
 * and divided by 100, which is the only reading under which both are in range.
 */
export function parseFraction(raw: string | null): number | null {
  if (raw == null) return null;
  const m = /^(-?[\d.]+)\s*%?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return raw.includes('%') || n > 1 ? n / 100 : n;
}

export function isNotApplicable(raw: string | null): boolean {
  return raw == null || /^n\/?a$/i.test(raw.trim());
}

// ── the framework ───────────────────────────────────────────────────────────

/** Sheet 1. */
export const FUTURE_KPIS: KpiDefinition[] = [
  {
    id: 'otd',
    category: 'RELIABILITY',
    measure: '% of services exiting network on schedule within tolerance of 30min (OTD) (SPRINT data)',
    unit: '% of total services',
    attribution: 'IM+TOC',
    frequency: 'Quarterly / Route',
    framework: 'future',
  },
  {
    id: 'ota',
    category: 'RELIABILITY',
    measure: '% of services entering network on schedule within tolerance (OTA) (SPRINT data)',
    unit: '% of total services',
    attribution: 'IM+TOC',
    frequency: 'Quarterly / Route',
    framework: 'future',
  },
  {
    id: 'delay-im',
    category: 'DELAY_ATTRIBUTION',
    measure: 'Delay minutes per train – IM causes',
    unit: 'Minutes/train',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'future',
  },
  {
    id: 'delay-toc',
    category: 'DELAY_ATTRIBUTION',
    measure: 'Delay minutes per train – TOC causes',
    unit: 'Minutes/train',
    attribution: 'TOC',
    frequency: 'Quarterly / Route',
    framework: 'future',
  },
  {
    id: 'slot-change',
    category: 'SLOT_MODIFICATION',
    measure: 'Requests to change allocated slot',
    unit: 'Count of requests and % accepted',
    attribution: 'IM+TOC',
    frequency: 'Per request / Period',
    framework: 'future',
  },
  {
    id: 'cancel-after-reject',
    category: 'SLOT_MODIFICATION',
    measure: 'Cancellation after IM rejects modification request',
    unit: 'Treated as cancellation (count / % of slots)',
    attribution: 'TOC',
    frequency: 'Per request / Period',
    framework: 'future',
  },
  {
    id: 'im-slot-fault',
    category: 'IM_NON_COMPLIANCE',
    measure: 'Failure to honour allocated slot due to IM fault',
    unit: '% of cancelled slots',
    attribution: 'IM',
    frequency: 'Period / Train Path',
    framework: 'future',
  },
  {
    id: 'im-disclosure',
    category: 'IM_NON_COMPLIANCE',
    measure: 'Failure to meet disclosure / notification obligations',
    unit: 'Count of breaches',
    attribution: 'IM',
    frequency: 'Period / Train Path',
    framework: 'future',
  },
  {
    id: 'toc-late-cancel',
    category: 'TOC_NON_USAGE',
    measure: 'Cancellation ≥xx days before departure',
    unit: '% of cancelled slots',
    attribution: 'TOC',
    frequency: 'Per request / Period',
    framework: 'future',
    /**
     * EXC-043-07: the "xx" is literal in the source. This is the notice period
     * that would drive TOC non-usage charges, so it is a pricing gap, not a
     * typo to be tidied away.
     */
    note: 'Cancellation notice threshold undefined in source ("≥xx days")',
  },
  {
    id: 'toc-no-show',
    category: 'TOC_NON_USAGE',
    measure: 'Failure to cancel (no-show)',
    unit: '% of cancelled slots',
    attribution: 'TOC',
    frequency: 'Per request / Period',
    framework: 'future',
  },
  {
    id: 'train-control-cost',
    category: 'IM_UNIT_COSTS',
    measure: 'Train control costs',
    unit: 'R/track-km',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'future',
  },
];

/** Sheet 2. */
export const CURRENT_KPIS: KpiDefinition[] = [
  {
    id: 'transit',
    category: 'TRANSIT_SPEEDS',
    measure: 'Route Scheduled Train Throughput Times',
    unit: 'Average transit times (hours)',
    attribution: 'IM+TOC',
    frequency: 'Annual / Train Path',
    framework: 'current',
  },
  {
    id: 'tsr-track',
    category: 'TRACK_SERVICE_QUALITY',
    measure: 'Track under Temporary Speed Restriction at end of reporting period',
    unit: 'Km and % of total track',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'current',
  },
  {
    id: 'tsr-count',
    category: 'TRACK_SERVICE_QUALITY',
    measure: 'Number of speed restrictions at end of reporting period',
    unit: 'Count',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'current',
  },
  {
    id: 'manual-auth',
    category: 'TRACK_SERVICE_QUALITY',
    measure: 'Number of manual train authorisations at end of reporting period',
    unit: 'Count',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'current',
  },
  {
    id: 'tqi',
    category: 'TRACK_CONDITION',
    measure: 'Track Quality Index',
    unit: '50th Percentile TQI',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'current',
    /** EXC-043-06. */
    note: 'Polarity not stated by TRIM; no better/worse judgement is rendered',
  },
  {
    id: 'ohti',
    category: 'TRACK_CONDITION',
    measure: 'Overhead traction quality index',
    unit: 'Index value',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'current',
    /** EXC-043-08: N/A on every corridor this period. */
    notYetMeasured: true,
  },
  {
    id: 'substation',
    category: 'TRACK_CONDITION',
    measure: 'Traction Substation Availability',
    unit: '%',
    attribution: 'IM',
    frequency: 'Quarterly / Route',
    framework: 'current',
    /** EXC-043-05: source mixes "94%" and "0.87" for this field. */
    note: 'Source mixes percentage and decimal notation across corridors',
  },
];

/**
 * Polarity per KPI.
 *
 * null is a deliberate value meaning "the source does not say". It is ONLY
 * null for TQI, and it must stay that way until TRIM states the direction -
 * guessing would paint six corridors green or red on nothing.
 */
export const KPI_POLARITY: Record<string, KpiPolarity> = {
  transit: 'lowerIsBetter',
  'tsr-track': 'lowerIsBetter',
  'tsr-count': 'lowerIsBetter',
  'manual-auth': 'lowerIsBetter',
  substation: 'higherIsBetter',
  ohti: 'higherIsBetter',
  tqi: null,
  otd: 'higherIsBetter',
  ota: 'higherIsBetter',
  'delay-im': 'lowerIsBetter',
  'delay-toc': 'lowerIsBetter',
  'im-slot-fault': 'lowerIsBetter',
  'im-disclosure': 'lowerIsBetter',
  'toc-late-cancel': 'lowerIsBetter',
  'toc-no-show': 'lowerIsBetter',
  'train-control-cost': 'lowerIsBetter',
};

/**
 * Whether a value is an improvement on its baseline.
 *
 * Returns null when it cannot be decided: unknown polarity, missing figures,
 * or a flat line. Callers must treat null as "render neutral", not "render
 * green" - an undecided KPI shown as healthy is worse than one shown as blank.
 */
export function assess(
  kpiId: string,
  baseline: string | null,
  target: string | null,
): 'improving' | 'regressing' | 'flat' | null {
  const polarity = KPI_POLARITY[kpiId];
  if (polarity == null) return null;
  if (isNotApplicable(baseline) || isNotApplicable(target)) return null;

  const isDuration = /^\d+:\d{2}$/.test(baseline ?? '');
  const b = isDuration ? parseDuration(baseline) : parseFraction(baseline);
  const t = isDuration ? parseDuration(target) : parseFraction(target);
  if (b == null || t == null) return null;
  if (b === t) return 'flat';

  const better = polarity === 'lowerIsBetter' ? t < b : t > b;
  return better ? 'improving' : 'regressing';
}

// ── corridors ────────────────────────────────────────────────────────────────

export const CORRIDORS: CorridorKpis[] = [
  {
    id: 'ore',
    sheet: 'Sheet 3',
    name: 'Ore',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: SAZ-SIS', baseline: '27:07', target: '24:43' },
      { kpi: 'Return: SIS-SAZ', baseline: '26:15', target: '23:51' },
      { kpi: 'tsr-track', baseline: '2.50%', target: '1.6% of the network', comment: '100% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '7', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '15291', target: '11691', comment: '23% reduction' },
      { kpi: 'tqi', baseline: '5', target: '5', comment: 'TQI within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      { kpi: 'substation', baseline: '100%', target: '100%', comment: 'All Traction Feeder Stations are On-Load' },
    ],
  },
  {
    id: 'manganese',
    sheet: 'Sheet 4',
    name: 'Manganese',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: HTZ-PE', baseline: '33:45', target: '32:00' },
      { kpi: 'Return: PE-HTZ', baseline: '45:00', target: '41:16' },
      { kpi: 'tsr-track', baseline: '1.70%', target: '1.6% of the network', comment: '100% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '19', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '534928', target: '323728', comment: '39% reduction' },
      { kpi: 'tqi', baseline: '6.4', target: '8', comment: 'TQI within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      {
        kpi: 'substation',
        baseline: '94%',
        target: '0.97',
        comment: '5 units are off under PE depot. The target is to restore at least 3 traction units within the current financial year',
      },
    ],
  },
  {
    id: 'magnetite',
    sheet: 'Sheet 5',
    name: 'Magnetite — Phalaborwa to Richardsbay',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: PHW-RBQ', baseline: '39:50', target: '33:32' },
      { kpi: 'Forward: RBQ-PHW', baseline: '35:00', target: '33:55' },
      { kpi: 'tsr-track', baseline: '4%', target: '1.6% of the network', comment: '18% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '6', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '61324', target: '29743', comment: '51% reduction' },
      { kpi: 'tqi', baseline: '8.2', target: '8', comment: 'TQI within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Line not electrified' },
      { kpi: 'substation', baseline: 'N/A', target: 'N/A', comment: 'Line not electrified' },
    ],
  },
  {
    id: 'musina',
    sheet: 'Sheet 6',
    name: 'Musina to Pyramid / Hoedspruit',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: Musina - Pyramid', baseline: '19:56', target: '18:44' },
      { kpi: 'Forward: Musina - Hoedspruit', baseline: '17:29', target: '15:05' },
      { kpi: 'Return: Pyramid-Musina', baseline: '18:29', target: '17:17' },
      { kpi: 'Return: Hoedspruit-Musina', baseline: '20:07', target: '17:43' },
      { kpi: 'tsr-track', baseline: '0.80%', target: '1.6% of the network' },
      { kpi: 'tsr-count', baseline: '6', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '1282', target: '1154', comment: '10% reduction' },
      { kpi: 'tqi', baseline: '7.4 (N2)\n10.6 (N3)', target: '9 (N2)\n12 (N3)', comment: 'TQI within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Line not electrified' },
      { kpi: 'substation', baseline: 'N/A', target: 'N/A', comment: 'Line not electrified' },
    ],
  },
  {
    id: 'vereeniging',
    sheet: 'Sheet 7',
    name: 'Vereeniging / Danskraal to East London',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: Danskraal-East London', baseline: '44:35', target: '39:47' },
      { kpi: 'Forward: Vereeniging-East London', baseline: '38:19', target: '32:19' },
      { kpi: 'Return: East London-Danskaal', baseline: '40:34', target: '35:46' },
      { kpi: 'Return: East London-Vereeniging', baseline: '35:24', target: '29:24' },
      { kpi: 'tsr-track', baseline: '2.20%', target: '1.6% of the network', comment: '97% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '27', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '99078', target: '97441', comment: '2% reduction' },
      { kpi: 'tqi', baseline: '8.1', target: '9', comment: 'Within range of target' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      { kpi: 'substation', baseline: 'N/A', target: 'N/A' },
    ],
  },
  {
    id: 'mafikeng',
    sheet: 'Sheet 8',
    name: 'Mafikeng to Beaconsfield / Potchefstroom',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: Mafikeng - Potchefstroom', baseline: '30:20', target: '23:20' },
      { kpi: 'Forward: Mafikeng - Beaconsfield', baseline: '18:13', target: '14:37' },
      { kpi: 'Return: Potchefstroom-Mafikeng', baseline: '32:18', target: '31:20' },
      { kpi: 'Return: Beaconsfield-Mafikeng', baseline: '17:51', target: '14:15' },
      { kpi: 'tsr-track', baseline: '2.80%', target: '1.6% of the network', comment: '88% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '1', target: 'N/A' },
      {
        kpi: 'manual-auth',
        baseline: '208130',
        target: '186054',
        comment: '10% reduction for Mafikeng - Veertien Stroom (TWS), PCM to BEC covered in JHB to CPT',
      },
      { kpi: 'tqi', baseline: '8.2', target: '9', comment: 'Within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      { kpi: 'substation', baseline: '0.83', target: '90%' },
    ],
  },
  {
    id: 'lephalale',
    sheet: 'Sheet 9',
    name: 'Lephalale – Richardsbay',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: Lephalale-Richardsbay', baseline: '53:05', target: '44:41' },
      { kpi: 'Forward: Trichardt-Richardsbay', baseline: '21:55', target: '18:19' },
      { kpi: 'Return: Richardsbay-Lephalale', baseline: '60:58', target: '52:34' },
      { kpi: 'Return: Richardsbay-Trichardt', baseline: '21:08', target: '17:32' },
      { kpi: 'tsr-track', baseline: '1.70%', target: '1.6% of the network', comment: '93% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '25', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '392474', target: '221649', comment: '43% reduction' },
      { kpi: 'tqi', baseline: '7.5 (N1)\n5.7 (S)', target: '8 (N1)\n6 (S)', comment: 'TQI within acceptable range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      { kpi: 'substation', baseline: '0.87', target: '90%' },
    ],
  },
  {
    id: 'jhb-durban',
    sheet: 'Sheet 10',
    name: 'Container — Johannesburg (City Deep) to Durban (Kingsrest)',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: Johannesburg-Durban', baseline: '38:06', target: '29:00' },
      { kpi: 'Return: Durban-Johannesburg', baseline: '33:07', target: '29:00' },
      { kpi: 'tsr-track', baseline: '1.40%', target: '1.6% of the network', comment: '56% further reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '21', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '721324', target: '648192', comment: '10% reduction' },
      { kpi: 'tqi', baseline: '10', target: '8', comment: 'TQI within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      { kpi: 'substation', baseline: '73%', target: '90%' },
    ],
  },
  {
    id: 'rayton',
    sheet: 'Sheet 11',
    name: 'Rayton to Komatipoort / Richards Bay',
    incomplete: false,
    kpis: [
      { kpi: 'Forward: Rayton-Komatipoort', baseline: '28:02', target: '23:14' },
      { kpi: 'Forward: Rayton-Richardsbay', baseline: '29:48', target: '23:48' },
      { kpi: 'Forward: Steelpoort-Komatipoort', baseline: '31:10', target: '26:22' },
      { kpi: 'Return: Komatipoort-Rayton', baseline: '27:01', target: '22:13' },
      { kpi: 'Return: Richardsbay-Rayton', baseline: '29:15', target: '23:15' },
      { kpi: 'Return: Komatipoort-Steelpoort', baseline: '31:43', target: '26:55' },
      { kpi: 'tsr-track', baseline: '5%', target: '1.6% of the network', comment: '66% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '14', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '267358', target: '178493', comment: '33% reduction' },
      { kpi: 'tqi', baseline: '8.8', target: '8', comment: 'Within range' },
      { kpi: 'ohti', baseline: 'N/A', target: 'N/A', comment: 'Under development, next reporting phase' },
      { kpi: 'substation', baseline: '94%', target: '100%' },
    ],
  },
  {
    id: 'jhb-cpt',
    sheet: 'Sheet 12',
    name: 'Johannesburg (City Deep) – Cape Town (Bellville)',
    /** EXC-043-03: the supplied sheet ends mid-TRACK CONDITION. */
    incomplete: true,
    kpis: [
      { kpi: 'Forward: JHB-CT', baseline: '78:08', target: '59:18' },
      { kpi: 'Return: CT-JHB', baseline: '56:55', target: '53:05' },
      { kpi: 'tsr-track', baseline: '1.50%', target: '1.6% of the network', comment: '100% reduction by end of FY' },
      { kpi: 'tsr-count', baseline: '4', target: 'N/A' },
      { kpi: 'manual-auth', baseline: '611579', target: '409503', comment: '33% reduction' },
      /** ABSENT, not zero - the sheet was truncated. */
      { kpi: 'tqi', baseline: null, target: null },
      { kpi: 'ohti', baseline: null, target: null },
      { kpi: 'substation', baseline: null, target: null },
    ],
  },
];

export function corridorById(id: string): CorridorKpis | undefined {
  return CORRIDORS.find((c) => c.id === id);
}
