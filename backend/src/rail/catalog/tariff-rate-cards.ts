/**
 * Tariff rate cards — a published tariff, resolved the way the network that published it works.
 *
 * THE PROBLEM THIS SOLVES. The old model demanded a per-corridor, per-financial-year c/GTK
 * rate. Transnet does not publish one. Table 17 (Network Statement V4 §5.2.3) is a
 * COMMODITY table: it publishes, for each traffic category, a train-km rate AND a GTK rate,
 * and it ties only two of the ten categories to a corridor. So the calculator sat on an
 * empty catalogue and returned BLOCKED for every corridor, while a rate card full of real
 * published figures sat next to it unused.
 *
 * THE FIX. A rate card is scoped to what the network actually publishes:
 *
 *   • COMMODITY  — Transnet. "OreCor (Iron Ore)" is R680/train-km + 3.54 c/GTK, no corridor.
 *   • CORRIDOR   — most European IMs, and any future Network Statement that publishes
 *                  per-route rates. More specific, so it wins when both exist.
 *   • NETWORK    — a single national rate where no further breakdown is published.
 *
 * Resolution runs most-specific first: CORRIDOR → COMMODITY → NETWORK. When nothing
 * matches, the calculator BLOCKS. It never falls back to a neighbouring commodity's rate
 * and never averages.
 *
 * CURRENCY. Every card declares the currency it is published in and the calculation runs
 * in one currency end to end. There is no exchange rate anywhere in this repository, so
 * none is ever applied: a EUR card and a ZAR request do not mix, and the calculator says
 * so instead of converting.
 */
import { Money } from '../../common/money.util';
import { ACCESS_TARIFF_CATALOG, ACCESS_TARIFF_SOURCE, AccessTariffEntry } from './access-tariffs.catalog';
import { CHARGING_BASE_LABEL, ChargingBase, QUANTITY_UNIT, TariffQuantities, quantityFor } from './charging-bases';

/**
 * Whether a published rate is counted in whole currency units or in hundredths.
 *
 * This distinction is the difference between R68,000 and R6,800,000. Transnet publishes
 * train-km in RANDS and GTK in CENTS — in the same table, in adjacent columns. Guessing
 * wrong is a 100x error on a real invoice, so the scale is carried with the rate rather
 * than inferred from its magnitude.
 */
export type RateScale = 'MAJOR' | 'MINOR';

/** The label for a currency's hundredth, as the network would print it. */
const MINOR_UNIT_LABEL: Record<string, string> = { ZAR: 'c', EUR: 'ct', USD: '¢', GBP: 'p', CHF: 'rp', ZWL: 'c' };
export const minorUnitLabel = (currency: string): string => MINOR_UNIT_LABEL[currency] ?? 'cent';

export interface TariffComponent {
  base: ChargingBase;
  /**
   * The published rate. `null` = this component is NOT published for this card.
   * `0` = published as zero, which is charged as zero and shown as zero.
   * The two are different and the difference is load-bearing: Table 17 prints 0.0 c/GTK
   * for metro, passenger and loose locomotives because it charges those entirely on
   * train-km. Reading that zero as "unknown" and refusing to price would be wrong;
   * reading an unpublished component as zero would undercharge.
   */
  rate: number | null;
  scale: RateScale;
}

export type RateCardScope =
  | { kind: 'CORRIDOR'; corridorCode: string }
  | { kind: 'COMMODITY'; category: string }
  | { kind: 'NETWORK' };

export interface TariffRateCard {
  id: string;
  /** Which network published this — 'transnet', or any other infrastructure manager. */
  networkCode: string;
  financialYear: string;
  scope: RateCardScope;
  /** ISO-4217. The whole calculation runs in one currency; mixed currencies are refused. */
  currency: string;
  components: readonly TariffComponent[];
  /** Charges that ride along with access but are not a charging base. */
  /** Rate for the empty return leg, in cents per GTK. null = not published. */
  emptyCentsPerGtk?: number | null;
  overloadPenaltyPerTonneZar?: number | null;
  dieselLitresPer1000Gtk?: number | null;
  electricKwhPer1000Gtk?: number | null;
  dieselPricePerLitreZar?: number | null;
  electricityPricePerKwhZar?: number | null;
  dataStatus: 'SOURCE_PENDING' | 'VERIFIED';
  sourceRef?: string | null;
  notes?: string;
  /**
   * Overrides the invoice line description. Only meaningful for a single-component
   * card: it exists so a legacy corridor schedule keeps the wording its invoices
   * already showed, rather than changing what a customer sees on an invoice.
   */
  lineDescription?: string | null;
}

/** How a card was matched, recorded on the result so the invoice can say where its rate came from. */
export type RateResolution = 'CORRIDOR' | 'COMMODITY' | 'NETWORK';

const key = (s: string): string => s.replace(/&amp;/g, '&').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const slug = (s: string): string => key(s).replace(/ /g, '-');

/**
 * Transnet's Table 17 as rate cards — one per published category, both components.
 *
 * These are the real published figures (Network Statement V4, 18 September 2026, p157,
 * effective 1 August 2026). Nothing is rounded, averaged or approximated.
 */
export function buildTransnetTable17RateCards(catalog: readonly AccessTariffEntry[] = ACCESS_TARIFF_CATALOG): TariffRateCard[] {
  return catalog.map((e) => ({
    id: `transnet-table17-${slug(e.category)}`,
    networkCode: 'transnet',
    financialYear: e.financialYear,
    scope: { kind: 'COMMODITY' as const, category: e.category },
    currency: 'ZAR',
    components: [
      // §5.2.3: "one tariff is based on train kms and the other on GTKs". Both are charged.
      { base: 'TRAIN_KM' as const, rate: e.zarPerTrainKm, scale: 'MAJOR' as const },
      { base: 'GTK' as const, rate: e.centsPerGtk, scale: 'MINOR' as const },
    ],
    emptyCentsPerGtk: null,
    overloadPenaltyPerTonneZar: null,
    dieselLitresPer1000Gtk: null,
    electricKwhPer1000Gtk: null,
    dieselPricePerLitreZar: null,
    electricityPricePerKwhZar: null,
    dataStatus: 'VERIFIED' as const,
    sourceRef: ACCESS_TARIFF_SOURCE,
    notes: e.notes,
  }));
}

export const TRANSNET_TABLE_17_RATE_CARDS: readonly TariffRateCard[] = buildTransnetTable17RateCards();

/** The unit a rate is printed in, e.g. "ZAR/train-km", "c/GTK", "EUR/path-km". */
export function rateUnitFor(base: ChargingBase, scale: RateScale, currency: string): string {
  const unit = scale === 'MINOR' ? minorUnitLabel(currency) : currency;
  return `${unit}/${QUANTITY_UNIT[base]}`;
}

/** rate × quantity, converted out of minor units when the network publishes in hundredths. */
export function componentAmount(rate: number, scale: RateScale, quantity: number): number {
  const effective = scale === 'MINOR' ? rate / 100 : rate;
  return Money.round(effective * quantity);
}

export interface RateCardQuery {
  networkCode: string;
  financialYear: string;
  corridorCode?: string | null;
  commodityCategory?: string | null;
  allowEscalation?: boolean;
}

export interface RateCardResolution {
  card: TariffRateCard | null;
  /** Whole financial years the rates were escalated by (0 = used as published). */
  years: number;
  resolution: RateResolution | null;
  /** Why nothing could be resolved, or null when a card was found. */
  blocker: string | null;
}

const parseFy = (fy: string): number | null => {
  const m = /^(\d{4})\/(\d{2})$/.exec((fy ?? '').trim());
  if (!m) return null;
  const start = Number(m[1]);
  return Number(m[2]) === (start + 1) % 100 ? start : null;
};

/** The most specific VERIFIED card that applies, in the order CORRIDOR → COMMODITY → NETWORK. */
export function resolveRateCard(cards: readonly TariffRateCard[], q: RateCardQuery): RateCardResolution {
  const network = String(q.networkCode || '').toLowerCase();
  const mine = cards.filter((c) => c.networkCode.toLowerCase() === network);
  const want = parseFy(q.financialYear);

  const pick = (pool: readonly TariffRateCard[]): { card: TariffRateCard; years: number } | null => {
    const usable = pool.filter((c) => c.dataStatus === 'VERIFIED' && c.components.some((x) => typeof x.rate === 'number'));
    const exact = usable.find((c) => c.financialYear === q.financialYear);
    if (exact) return { card: exact, years: 0 };
    if (want === null || !q.allowEscalation) return null;
    const earlier = usable
      .map((c) => ({ c, gap: want - (parseFy(c.financialYear) ?? Number.NaN) }))
      .filter((x) => Number.isInteger(x.gap) && x.gap > 0)
      .sort((a, b) => a.gap - b.gap)[0];
    return earlier ? { card: earlier.c, years: earlier.gap } : null;
  };

  const corridor = q.corridorCode
    ? pick(mine.filter((c) => c.scope.kind === 'CORRIDOR' && c.scope.corridorCode === q.corridorCode))
    : null;
  if (corridor) return { ...corridor, resolution: 'CORRIDOR', blocker: null };

  const commodity = q.commodityCategory
    ? pick(mine.filter((c) => c.scope.kind === 'COMMODITY' && key(c.scope.category) === key(q.commodityCategory as string)))
    : null;
  if (commodity) return { ...commodity, resolution: 'COMMODITY', blocker: null };

  const netDefault = pick(mine.filter((c) => c.scope.kind === 'NETWORK'));
  if (netDefault) return { card: netDefault.card, years: netDefault.years, resolution: 'NETWORK', blocker: null };

  const what = [
    q.corridorCode ? `corridor ${q.corridorCode}` : null,
    q.commodityCategory ? `category "${q.commodityCategory}"` : null,
  ].filter(Boolean).join(' / ') || 'this network';

  const unverified = mine.some((c) => c.dataStatus !== 'VERIFIED');
  return {
    card: null, years: 0, resolution: null,
    blocker: unverified
      ? `A rate is loaded for ${what} but it is not VERIFIED against a cited source, so it is not used.`
      : `No rate is published for ${what}${q.commodityCategory ? '' : ' and no traffic category was given'}. A rate is never inferred from a neighbouring commodity or a different corridor, so this cannot be priced.`,
  };
}

/**
 * A legacy per-corridor GTK schedule, presented as a rate card.
 *
 * This exists so the two models coexist rather than one silently disabling the other. A
 * corridor card outranks a commodity card at resolution, so a network that DOES publish
 * per-route rates keeps using them, while Transnet traffic — which publishes no corridor
 * rates — falls through to Table 17. Without this, loading the published Transnet cards
 * would have made every already-loaded corridor schedule dead data.
 */
export interface ScheduleShaped {
  id: string;
  corridorCode: string;
  financialYear: string;
  loadedCentsPerGtk?: number | null;
  emptyCentsPerGtk?: number | null;
  dieselLitresPer1000Gtk?: number | null;
  electricKwhPer1000Gtk?: number | null;
  dieselPricePerLitreZar?: number | null;
  electricityPricePerKwhZar?: number | null;
  overloadPenaltyPerTonneZar?: number | null;
  dataStatus: 'SOURCE_PENDING' | 'VERIFIED';
  sourceRef?: string | null;
}

export function scheduleToRateCard(s: ScheduleShaped): TariffRateCard {
  return {
    id: s.id,
    networkCode: 'transnet',
    financialYear: s.financialYear,
    scope: { kind: 'CORRIDOR', corridorCode: s.corridorCode },
    currency: 'ZAR',
    // A legacy schedule carries one component: gross tonne-kilometres, in cents.
    components: [{ base: 'GTK', rate: s.loadedCentsPerGtk ?? null, scale: 'MINOR' }],
    emptyCentsPerGtk: s.emptyCentsPerGtk ?? null,
    overloadPenaltyPerTonneZar: s.overloadPenaltyPerTonneZar ?? null,
    dieselLitresPer1000Gtk: s.dieselLitresPer1000Gtk ?? null,
    electricKwhPer1000Gtk: s.electricKwhPer1000Gtk ?? null,
    dieselPricePerLitreZar: s.dieselPricePerLitreZar ?? null,
    electricityPricePerKwhZar: s.electricityPricePerKwhZar ?? null,
    dataStatus: s.dataStatus,
    sourceRef: s.sourceRef ?? null,
    lineDescription: `Infrastructure access — loaded train (${s.corridorCode})`,
  };
}

/** The quantity a component consumes. Null means the line must be left UNPRICED, not charged at zero. */
export const quantityForComponent = (base: ChargingBase, q: TariffQuantities): number | null => quantityFor(base, q);

export const baseLabel = (base: ChargingBase): string => CHARGING_BASE_LABEL[base];
