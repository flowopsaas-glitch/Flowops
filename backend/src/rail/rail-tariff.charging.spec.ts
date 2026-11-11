/**
 * Charging-base tariff model — the two-part tariff Transnet actually publishes,
 * generalised so another infrastructure manager's charging basis is a peer, not a special case.
 *
 * WHY THIS FILE EXISTS. §5.2.3 of the Network Statement says the access tariff "will be a
 * two-part tariff where one tariff is based on train kms and the other on GTKs". Both
 * components are charged. The calculator modelled GTK only, so every category was
 * undercharged — and the three categories Table 17 prints as 0.0 c/GTK (metro/passenger
 * under 12 wagons, passenger over 12 wagons, loose locomotives) were priced at ZERO,
 * because they are charged on the train-km component alone. That is gap C-05.
 *
 * THE RATES EXERCISED HERE ARE THE REAL PUBLISHED ONES (Table 17, p157, effective
 * 1 August 2026). Nothing in this file is a synthetic fixture: if a figure is asserted it
 * is because the Network Statement prints it. What is synthetic is the train — the wagon
 * masses and distances are inputs, not published facts.
 */
import {
  TariffRequest, TariffContext, calculateTariff,
} from './rail-tariff.rules';
import { ACCESS_TARIFF_CATALOG } from './catalog/access-tariffs.catalog';
import { computeQuantities } from './catalog/charging-bases';
import {
  TRANSNET_TABLE_17_RATE_CARDS, TariffRateCard, buildTransnetTable17RateCards, resolveRateCard,
} from './catalog/tariff-rate-cards';

// ── inputs (these are NOT published facts — they describe the train being priced) ──
/** 162 t gross over two wagons: 82 + 80. */
const wagons = [
  { wagonNumber: 'W1', tareTonnes: 22, loadedTonnes: 60 },
  { wagonNumber: 'W2', tareTonnes: 22, loadedTonnes: 58 },
];

const baseCtx = (over: Partial<TariffContext> = {}): TariffContext => ({
  wagons, latestReadings: [], schedules: [], ancillaryCatalog: [], rateCards: TRANSNET_TABLE_17_RATE_CARDS, ...over,
});
const baseReq = (over: Partial<TariffRequest> = {}): TariffRequest => ({
  corridorCode: null, financialYear: '2026/27', distanceKm: 100, ...over,
});
const lineOf = (r: ReturnType<typeof calculateTariff>, kind: string) => r.lines.find((l) => l.kind === kind);

// ═══════════════════════════════════════════════════════════════════════════════
describe('the two-part tariff Transnet publishes', () => {
  it('charges BOTH the train-km component and the GTK component', () => {
    const r = calculateTariff(
      baseReq({ commodityCategory: 'OreCor (Iron Ore)' }),
      baseCtx(),
    );

    expect(r.status).toBe('PRICED');

    // Table 17: iron ore is R680 per train-km AND 3.54 c/GTK.
    // train-km: 100 km × 1 train = 100 train-km × R680 = R68,000
    const trainKm = lineOf(r, 'TRAIN_KM')!;
    expect(trainKm.quantity).toBe(100);
    expect(trainKm.rate).toBe(680);
    expect(trainKm.amountZar).toBe(68_000);

    // GTK: 162 t gross × 100 km = 16,200 GTK × 3.54 c = R573.48
    const gtk = lineOf(r, 'GTK_LOADED')!;
    expect(gtk.quantity).toBe(16_200);
    expect(gtk.rate).toBe(3.54);
    expect(gtk.amountZar).toBe(573.48);

    expect(r.subtotalZar).toBe(68_573.48);
  });

  it('no longer undercharges the three categories Table 17 prints as 0.0 c/GTK', () => {
    // This is the C-05 regression, and it is the whole point of the change.
    // Metro/passenger <12 wagons is R50/train-km with a PUBLISHED GTK rate of zero.
    // Under a GTK-only calculator this priced at R0.00. It must not.
    for (const [category, perTrainKm, expected] of [
      ['Metro Trains & Passenger < 12 Wagons', 50, 5_000],
      ['Passenger Trains > 12 Wagons', 60, 6_000],
      ['Loose Locomotives', 12, 1_200],
    ] as const) {
      const r = calculateTariff(baseReq({ commodityCategory: category }), baseCtx());
      expect(r.status).toBe('PRICED');
      expect(lineOf(r, 'TRAIN_KM')!.rate).toBe(perTrainKm);
      expect(r.subtotalZar).toBe(expected);
      // A published zero is charged as zero — it is not "unknown".
      expect(lineOf(r, 'GTK_LOADED')!.amountZar).toBe(0);
    }
  });

  it('prices a commodity with no corridor, because Table 17 is a commodity table', () => {
    // "Mineral Exports" is published with no corridor. The old model demanded a per-corridor
    // rate that Transnet does not publish, and refused to price. It must price.
    const r = calculateTariff(baseReq({ commodityCategory: 'Mineral Exports' }), baseCtx());
    expect(r.status).toBe('PRICED');
    // R30.75/train-km + 9.00 c/GTK: 100 × 30.75 = R3,075; 16,200 × 9c = R1,458
    expect(r.subtotalZar).toBe(4_533);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('rate scale: cents are hundredths, rands are not', () => {
  it('does not confuse the two scales (a 100x error either way)', () => {
    const r = calculateTariff(baseReq({ commodityCategory: 'Coal Exports NorthCor' }), baseCtx());
    // R260/train-km is a MAJOR figure: 100 × 260 = R26,000, not R260,000 or R260.
    expect(lineOf(r, 'TRAIN_KM')!.amountZar).toBe(26_000);
    // 6.03 c/GTK is a MINOR figure: 16,200 × 0.0603 = R976.86, not R97,686.
    expect(lineOf(r, 'GTK_LOADED')!.amountZar).toBe(976.86);
  });

  it('records the unit on each line so an invoice shows what it was charged for', () => {
    const r = calculateTariff(baseReq({ commodityCategory: 'OreCor (Iron Ore)' }), baseCtx());
    expect(lineOf(r, 'TRAIN_KM')!.rateUnit).toBe('ZAR/train-km');
    expect(lineOf(r, 'GTK_LOADED')!.rateUnit).toBe('c/GTK');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('international infrastructure managers', () => {
  const eur = (over: Partial<TariffRateCard> = {}): TariffRateCard => ({
    id: 'eu-1', networkCode: 'example-im', financialYear: '2026/27',
    scope: { kind: 'CORRIDOR', corridorCode: 'COR-NORTH' }, currency: 'EUR',
    components: [{ base: 'PATH_KM', rate: 4.2, scale: 'MAJOR' }],
    dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC — an EU-style per-path-km charge', ...over,
  });

  it('charges per path-km without needing to know the tonnage', () => {
    // Most European IMs charge for the train PATH, not for what the train carries.
    // A model hard-wired to GTK cannot express this at all.
    const r = calculateTariff(
      baseReq({ networkCode: 'example-im', corridorCode: 'COR-NORTH', currency: 'EUR', distanceKm: 250 }),
      baseCtx({ wagons: [], rateCards: [eur()] }),
    );
    expect(r.status).toBe('PRICED');
    expect(lineOf(r, 'PATH_KM')!.quantity).toBe(250);
    expect(lineOf(r, 'PATH_KM')!.amountZar).toBe(1_050);
    expect(r.currency).toBe('EUR');
  });

  it('supports a flat charge per train alongside a distance charge', () => {
    const r = calculateTariff(
      baseReq({ networkCode: 'example-im', corridorCode: 'COR-NORTH', currency: 'EUR', distanceKm: 10 }),
      baseCtx({ wagons: [], rateCards: [eur({ components: [
        { base: 'PATH_KM', rate: 4.2, scale: 'MAJOR' },
        { base: 'FLAT', rate: 150, scale: 'MAJOR' },
      ] })] }),
    );
    expect(lineOf(r, 'PATH_KM')!.amountZar).toBe(42);
    expect(lineOf(r, 'FLAT')!.amountZar).toBe(150);
    expect(r.subtotalZar).toBe(192);
  });

  it('refuses to mix currencies, and never invents an exchange rate', () => {
    // The single most dangerous failure in an international tariff engine is silently
    // adding euros to rands. There is no FX rate in the repository, so none is used.
    const r = calculateTariff(
      baseReq({ networkCode: 'example-im', corridorCode: 'COR-NORTH', distanceKm: 250 }), // default ZAR
      baseCtx({ wagons: [], rateCards: [eur()] }),
    );
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/EUR/i);
    expect(r.blockers.join(' ')).toMatch(/exchange|convert|rate/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('rate card resolution', () => {
  it('prefers a corridor card over a commodity card, because it is more specific', () => {
    // If an IM DOES publish per-route rates, they must beat the commodity default.
    const corridor: TariffRateCard = {
      id: 'c1', networkCode: 'transnet', financialYear: '2026/27',
      scope: { kind: 'CORRIDOR', corridorCode: 'COR-ORE' }, currency: 'ZAR',
      components: [{ base: 'TRAIN_KM', rate: 999, scale: 'MAJOR' }],
      dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC corridor override',
    };
    const { card, resolution } = resolveRateCard(
      [...TRANSNET_TABLE_17_RATE_CARDS, corridor],
      { networkCode: 'transnet', financialYear: '2026/27', corridorCode: 'COR-ORE', commodityCategory: 'OreCor (Iron Ore)', allowEscalation: false },
    );
    expect(card?.id).toBe('c1');
    expect(resolution).toBe('CORRIDOR');
  });

  it('falls back to the commodity card when no corridor card is published', () => {
    const { card, resolution } = resolveRateCard(
      TRANSNET_TABLE_17_RATE_CARDS,
      { networkCode: 'transnet', financialYear: '2026/27', corridorCode: 'COR-CAPE', commodityCategory: 'Grain & Tankers', allowEscalation: false },
    );
    expect(card?.scope).toEqual({ kind: 'COMMODITY', category: 'Grain & Tankers' });
    expect(resolution).toBe('COMMODITY');
  });

  it('blocks rather than guessing when neither is published', () => {
    const { card, blocker } = resolveRateCard(
      TRANSNET_TABLE_17_RATE_CARDS,
      { networkCode: 'transnet', financialYear: '2026/27', corridorCode: null, commodityCategory: 'Something Unpublished', allowEscalation: false },
    );
    expect(card).toBeNull();
    expect(blocker).toMatch(/not published|no rate/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('the published catalogue is faithfully transcribed', () => {
  it('turns every Table 17 row into a rate card with both components', () => {
    const cards = buildTransnetTable17RateCards();
    expect(cards).toHaveLength(ACCESS_TARIFF_CATALOG.length);
    for (const card of cards) {
      expect(card.networkCode).toBe('transnet');
      expect(card.currency).toBe('ZAR');
      expect(card.dataStatus).toBe('VERIFIED');
      expect(card.sourceRef).toMatch(/Table 17/);
      // Both components are charged, so both must be present on every card.
      expect(card.components.map((c) => c.base).sort()).toEqual(['GTK', 'TRAIN_KM']);
      // Every rate is a real number: null means "not published", and Table 17 publishes all ten.
      for (const c of card.components) expect(typeof c.rate).toBe('number');
    }
  });

  it('keeps the real published figures, not approximations', () => {
    const byCategory = new Map(buildTransnetTable17RateCards().map((c) => [
      (c.scope as { category: string }).category, c,
    ]));
    const ironOre = byCategory.get('OreCor (Iron Ore)')!;
    expect(ironOre.components.find((c) => c.base === 'TRAIN_KM')!.rate).toBe(680);
    expect(ironOre.components.find((c) => c.base === 'GTK')!.rate).toBe(3.54);
    // A zero is a published zero.
    const loose = byCategory.get('Loose Locomotives')!;
    expect(loose.components.find((c) => c.base === 'GTK')!.rate).toBe(0);
    expect(loose.components.find((c) => c.base === 'TRAIN_KM')!.rate).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('quantities', () => {
  it('derives train-km from distance and train count', () => {
    const q = computeQuantities({ distanceKm: 100, grossTonnes: 162, trainCount: 3 });
    expect(q.trainKm).toBe(300);
    // A path is the allocated route for one train, so three trains over 100 km is 300 path-km.
    expect(q.pathKm).toBe(300);
    expect(q.gtk).toBe(16_200);
  });

  it('leaves a quantity null when its input is unknown, rather than assuming', () => {
    const q = computeQuantities({ distanceKm: 100, grossTonnes: null });
    expect(q.gtk).toBeNull();
    expect(q.trainKm).toBe(100);
    expect(q.axleKm).toBeNull();
  });

  it('a flat charge always has a quantity of one', () => {
    expect(computeQuantities({ distanceKm: 0, grossTonnes: null }).flat).toBe(1);
  });
});
