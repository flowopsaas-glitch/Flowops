/**
 * Charging bases — the units an infrastructure manager charges access in.
 *
 * WHY THIS IS ABSTRACTED. FlowOps prices rail access for more than one network. Transnet
 * charges a TWO-PART tariff: §5.2.3 of the Network Statement — "the differentiated tariff
 * will be a two-part tariff where one tariff is based on train kms and the other on GTKs".
 * Most European infrastructure managers do not: they charge for the train PATH, sometimes
 * with a flat booking charge, and some charge on net rather than gross tonnes.
 *
 * So a charging base is data, not a branch in the calculator. A rate card declares which
 * bases it publishes rates for; the calculator charges whichever are present, in the
 * network's own currency, and refuses to price a base whose quantity it cannot work out.
 *
 * NOTHING HERE INVENTS A RATE. Every number that reaches this module comes from a published
 * tariff with a source reference. What this module decides is how a published rate is
 * applied to a train, which is arithmetic, not estimation.
 */

/** The unit an infrastructure manager charges access in. */
export type ChargingBase =
  /** R (or EUR, USD…) per train-kilometre. Transnet's first component. */
  | 'TRAIN_KM'
  /** Per path-kilometre — the allocated train path. The basis most European IMs use. */
  | 'PATH_KM'
  /** Per gross tonne-kilometre (tonnes INCLUDING the wagon tare). Transnet's second component. */
  | 'GTK'
  /** Per net tonne-kilometre (payload only). Used by IMs that charge on what is carried. */
  | 'NTK'
  /** Per axle-kilometre. */
  | 'AXLE_KM'
  /** A fixed charge per train or per path, independent of distance. */
  | 'FLAT';

export const CHARGING_BASES: readonly ChargingBase[] = ['TRAIN_KM', 'PATH_KM', 'GTK', 'NTK', 'AXLE_KM', 'FLAT'];

/** The unit a quantity of each base is counted in, exactly as it appears on an invoice. */
export const QUANTITY_UNIT: Record<ChargingBase, string> = {
  TRAIN_KM: 'train-km',
  PATH_KM: 'path-km',
  GTK: 'GTK',
  NTK: 'NTK',
  AXLE_KM: 'axle-km',
  FLAT: 'per train',
};

/** A plain-English description of each base, for the UI and for audit evidence. */
export const CHARGING_BASE_LABEL: Record<ChargingBase, string> = {
  TRAIN_KM: 'Train-kilometre',
  PATH_KM: 'Path-kilometre',
  GTK: 'Gross tonne-kilometre',
  NTK: 'Net tonne-kilometre',
  AXLE_KM: 'Axle-kilometre',
  FLAT: 'Flat charge per train',
};

/**
 * Every quantity the calculator can work out for one train movement.
 *
 * `null` means "this cannot be worked out from what was supplied" — which is NOT zero.
 * A null GTK means the masses are unknown and the line must be left UNPRICED, never
 * silently charged at zero.
 */
export interface TariffQuantities {
  distanceKm: number | null;
  /** distance × number of trains. Transnet's first component multiplies this. */
  trainKm: number | null;
  /** The length of the allocated path × number of paths. */
  pathKm: number | null;
  /** gross tonnes × distance. */
  gtk: number | null;
  /** payload tonnes × distance. */
  ntk: number | null;
  /** axles × distance. */
  axleKm: number | null;
  /** Always 1: a flat charge is levied once per train. */
  flat: number | null;
}

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Works out every quantity a charging base could need.
 *
 * `trainCount` defaults to 1 — a single train movement, which is what a consignment is
 * unless the caller says otherwise. It is an input, not an assumption hidden in the
 * arithmetic: the caller knows how many trains ran, and the basis string records it.
 */
export function computeQuantities(input: {
  distanceKm: number | null | undefined;
  grossTonnes?: number | null;
  netTonnes?: number | null;
  axles?: number | null;
  trainCount?: number;
}): TariffQuantities {
  const distanceKm = isPos(input.distanceKm) ? input.distanceKm : null;
  const trains = isPos(input.trainCount) ? Math.floor(input.trainCount) : 1;
  const gross = isPos(input.grossTonnes) ? input.grossTonnes : null;
  const net = isPos(input.netTonnes) ? input.netTonnes : null;
  const axles = isPos(input.axles) ? input.axles : null;

  const times = (n: number | null): number | null => (n === null || distanceKm === null ? null : round3(n * distanceKm));

  return {
    distanceKm,
    trainKm: distanceKm === null ? null : round3(distanceKm * trains),
    pathKm: distanceKm === null ? null : round3(distanceKm * trains),
    gtk: times(gross),
    ntk: times(net),
    axleKm: times(axles),
    // A flat charge is levied once per train regardless of distance.
    flat: trains,
  };
}

/** The quantity a given base consumes, or null when it cannot be worked out. */
export function quantityFor(base: ChargingBase, q: TariffQuantities): number | null {
  return q[QUANTITY_KEY[base]] ?? null;
}

const QUANTITY_KEY: Record<ChargingBase, keyof TariffQuantities> = {
  TRAIN_KM: 'trainKm',
  PATH_KM: 'pathKm',
  GTK: 'gtk',
  NTK: 'ntk',
  AXLE_KM: 'axleKm',
  FLAT: 'flat',
};
