import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ── Types ─────────────────────────────────────────────────────────────────

export interface RateRequest {
  fromAddress: string;
  toAddress:   string;
  weightKg:    number;
  parcels?:    number;
  companyId:   string;
}

export interface CarrierRate {
  carrier:     string;
  service:     string;
  serviceCode: string;
  base:        number;
  fuelSurcharge: number;
  vat:         number;
  total:       number;
  transitDays: string;
  currency:    'ZAR';
  source:      'live' | 'table';
  bestValue?:  boolean;
  fastest?:    boolean;
}

export interface RateShoppingResult {
  rates:         CarrierRate[];
  requestedAt:   string;
  fromAddress:   string;
  toAddress:     string;
  weightKg:      number;
  parcels:       number;
}

// ── SA Province detection ──────────────────────────────────────────────────
// Determines shipping zone multiplier from address strings.

const PROVINCE_KEYWORDS: Record<string, string[]> = {
  GP: ['johannesburg','sandton','pretoria','soweto','midrand','centurion','randburg','roodepoort','germiston','benoni','boksburg','krugersdorp','alberton','springs','edenvale','tembisa','mamelodi','soshanguve','atteridgeville','mabopane','GP','gauteng'],
  WC: ['cape town','stellenbosch','paarl','george','knysna','oudtshoorn','mossel bay','worcester','somerset west','strand','bellville','mitchells plain','khayelitsha','WC','western cape'],
  KZN: ['durban','pietermaritzburg','newcastle','richard\'s bay','empangeni','umlazi','pinetown','chatsworth','phoenix','KZN','kwazulu','natal','umhlanga'],
  EC:  ['port elizabeth','gqeberha','east london','king william\'s town','queenstown','grahamstown','bhisho','EC','eastern cape'],
  FS:  ['bloemfontein','welkom','sasolburg','bethlehem','FS','free state','mangaung'],
  LP:  ['polokwane','tzaneen','phalaborwa','louis trichardt','bela-bela','LP','limpopo'],
  MP:  ['nelspruit','mbombela','witbank','middelburg','secunda','MP','mpumalanga'],
  NW:  ['rustenburg','klerksdorp','potchefstroom','mafikeng','NW','north west'],
  NC:  ['upington','kimberley','springbok','NC','northern cape'],
};

function detectProvince(address: string): string {
  const lower = address.toLowerCase();
  for (const [prov, keywords] of Object.entries(PROVINCE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return prov;
  }
  return 'GP'; // default to Gauteng
}

function zoneMultiplier(from: string, to: string): number {
  const fp = detectProvince(from);
  const tp = detectProvince(to);
  if (fp === tp) return 0.90;   // same province
  // Overnight corridors (well-served)
  const overnight = new Set(['GP-WC','WC-GP','GP-KZN','KZN-GP','GP-EC','EC-GP']);
  if (overnight.has(`${fp}-${tp}`) || overnight.has(`${tp}-${fp}`)) return 1.15;
  return 1.30; // remote cross-province
}

// ── SA Rate Tables (realistic 2025 domestic courier rates, ZAR) ────────────
// Base + per-kg, before fuel surcharge + VAT.

interface RateTableEntry {
  carrier:     string;
  service:     string;
  serviceCode: string;
  base:        number;
  perKg:       number;
  transitDays: string;
}

const RATE_TABLE: RateTableEntry[] = [
  { carrier:'PostNet',     service:'Counter-to-Counter Standard',  serviceCode:'PN-STANDARD',  base:42,  perKg:6.5,  transitDays:'3–5 days'  },
  { carrier:'RAM Couriers',service:'Economy',                      serviceCode:'RAM-ECO',       base:52,  perKg:8.5,  transitDays:'2–4 days'  },
  { carrier:'Courier IT',  service:'Standard Door-to-Door',        serviceCode:'CIT-STD',       base:58,  perKg:10.5, transitDays:'2–3 days'  },
  { carrier:'Aramex SA',   service:'Express Economy',              serviceCode:'ARAMEX-ECO',    base:64,  perKg:12.0, transitDays:'2–3 days'  },
  { carrier:'DHL Express', service:'Express Domestic Economy',     serviceCode:'DHL-ECO',       base:72,  perKg:13.5, transitDays:'2–3 days'  },
  { carrier:'Courier IT',  service:'Express Door-to-Door',         serviceCode:'CIT-EXP',       base:88,  perKg:15.5, transitDays:'1–2 days'  },
  { carrier:'Aramex SA',   service:'Express Priority',             serviceCode:'ARAMEX-EXP',    base:94,  perKg:17.5, transitDays:'1–2 days'  },
  { carrier:'DHL Express', service:'Express Domestic Priority',    serviceCode:'DHL-PRIORITY',  base:118, perKg:21.5, transitDays:'Next day'  },
  { carrier:'RAM Couriers',service:'Overnight Express',            serviceCode:'RAM-OVERNIGHT', base:102, perKg:19.0, transitDays:'Next day'  },
];

const FUEL_SURCHARGE_PCT = 0.185; // 18.5%
const VAT_PCT            = 0.15;  // 15% SA VAT

function calculateTableRate(
  entry: RateTableEntry,
  weightKg: number,
  parcels: number,
  zoneMult: number,
): CarrierRate {
  const chargeable = weightKg * parcels;
  const base    = Math.round((entry.base + entry.perKg * chargeable) * zoneMult * 100) / 100;
  const fuel    = Math.round(base * FUEL_SURCHARGE_PCT * 100) / 100;
  const preVat  = base + fuel;
  const vat     = Math.round(preVat * VAT_PCT * 100) / 100;
  const total   = Math.round((preVat + vat) * 100) / 100;

  return {
    carrier: entry.carrier, service: entry.service, serviceCode: entry.serviceCode,
    base, fuelSurcharge: fuel, vat, total,
    transitDays: entry.transitDays, currency: 'ZAR', source: 'table',
  };
}

// ── Aramex SA Live API ────────────────────────────────────────────────────

const ARAMEX_RATE_URL =
  'https://ws.aramex.net/ShippingAPI.V2/Rate/Service_1_0.svc/json/CalculateRate';

interface AramexRateResponse {
  TotalAmount?: { Value?: number };
  RateDetails?: Array<{ TotalAmount?: { Value?: number } }>;
  HasErrors?: boolean;
  Notifications?: Array<{ Message?: string }>;
}

async function fetchAramexRate(
  cfg: { username: string; password: string; accountNumber: string; accountPin: string },
  from: string, to: string, weightKg: number,
  log: Logger,
): Promise<CarrierRate[] | null> {
  try {
    const body = {
      ClientInfo: {
        UserName: cfg.username, Password: cfg.password,
        Version: '1.0', AccountNumber: cfg.accountNumber,
        AccountPin: cfg.accountPin, AccountEntity: 'JHB',
        AccountCountryCode: 'ZA',
      },
      Transaction: { Reference1: 'FlowOps', Reference2: '', Reference3: '', Reference4: '', Reference5: '' },
      OriginAddress:      { Line1: from, City: detectProvince(from) === 'WC' ? 'Cape Town' : 'Johannesburg', CountryCode: 'ZA', PostCode: '' },
      DestinationAddress: { Line1: to,   City: detectProvince(to)   === 'WC' ? 'Cape Town' : 'Johannesburg', CountryCode: 'ZA', PostCode: '' },
      ShipmentDetails: {
        PaymentType: 'P', ProductGroup: 'DOM', ProductType: 'CDS',
        NumberOfPieces: 1, ActualWeight: { Value: weightKg, Unit: 'KG' },
        DescriptionOfGoods: 'Cargo',
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(ARAMEX_RATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data: AramexRateResponse = await res.json();
    if (data.HasErrors || !data.TotalAmount?.Value) return null;

    const total = data.TotalAmount.Value;
    const net   = Math.round(total / (1 + VAT_PCT) * 100) / 100;
    const vat   = Math.round(total - net) * 100 / 100;

    return [{
      carrier: 'Aramex SA', service: 'Express Priority (Live)', serviceCode: 'ARAMEX-LIVE',
      base: net, fuelSurcharge: 0, vat, total,
      transitDays: '1–2 days', currency: 'ZAR', source: 'live',
    }];
  } catch (err: any) {
    log.warn(`Aramex live rate failed: ${err?.message ?? err} — using table`);
    return null;
  }
}

// ── DHL Express myDHL+ API ────────────────────────────────────────────────

const DHL_RATE_URL = 'https://express.api.dhl.com/mydhlapi/rates';

async function fetchDHLRate(
  cfg: { clientId: string; clientSecret: string },
  from: string, to: string, weightKg: number,
  log: Logger,
): Promise<CarrierRate[] | null> {
  try {
    const fromProv = detectProvince(from) === 'WC' ? 'CPT' : 'JNB';
    const toProv   = detectProvince(to)   === 'WC' ? 'CPT' : 'JNB';
    const date     = new Date(); date.setDate(date.getDate() + 1);
    const planned  = date.toISOString().split('T')[0];

    const params = new URLSearchParams({
      accountNumber:  cfg.clientId,
      originCityName: fromProv, originCountryCode: 'ZA',
      destinationCityName: toProv, destinationCountryCode: 'ZA',
      weight: String(Math.max(weightKg, 0.5)),
      length: '20', width: '15', height: '10',
      plannedShippingDateAndTime: `${planned}T09:00:00GMT+02:00`,
      isCustomsDeclarable: 'false', unitOfMeasurement: 'metric',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${DHL_RATE_URL}?${params}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data: any = await res.json();
    const products: any[] = data?.products ?? [];

    return products.slice(0, 2).map((p: any) => {
      // Bug fix: the old expression `p?.totalPrice?.[0]?.price ?? p?.pricingDate ? 0 : 0`
      // had operator-precedence issues — the ternary consumed the entire nullish-coalesce
      // expression, so `total` was always 0 and every DHL live rate was discarded.
      // Correct: extract the price directly with proper grouping.
      const total: number = p?.totalPrice?.[0]?.price ?? 0;
      if (!total) return null;
      const net = Math.round(total / (1 + VAT_PCT) * 100) / 100;
      const vat = Math.round((total - net) * 100) / 100;
      return {
        carrier: 'DHL Express', service: `${p.productName} (Live)`, serviceCode: `DHL-${p.productCode}-LIVE`,
        base: net, fuelSurcharge: 0, vat, total,
        transitDays: p.deliveryCapabilities?.estimatedDeliveryDateAndTime ? '1–2 days' : '2–3 days',
        currency: 'ZAR' as const, source: 'live' as const,
      };
    }).filter(Boolean) as CarrierRate[];
  } catch (err: any) {
    log.warn(`DHL live rate failed: ${err?.message ?? err} — using table`);
    return null;
  }
}

// ── CarrierConfig (optional per-tenant overrides) ─────────────────────────

export interface CarrierConfig {
  enabled: boolean;
  markupPct: number;   // e.g. 10 for 10%
}

// ── Rate Shopping Service ──────────────────────────────────────────────────

@Injectable()
export class RateShoppingService {
  private readonly logger = new Logger(RateShoppingService.name);

  constructor(private config: ConfigService) {}

  async compare(req: RateRequest, carrierConfigs?: Record<string, CarrierConfig>): Promise<RateShoppingResult> {
    const { fromAddress, toAddress, weightKg, parcels = 1 } = req;
    const zoneMult = zoneMultiplier(fromAddress, toAddress);
    const rates: CarrierRate[] = [];

    // ── Try Aramex live API ──────────────────────────────────────────────
    const aramexUser = this.config.get<string>('ARAMEX_USERNAME');
    const aramexPass = this.config.get<string>('ARAMEX_PASSWORD');
    const aramexAcct = this.config.get<string>('ARAMEX_ACCOUNT_NUMBER');
    const aramexPin  = this.config.get<string>('ARAMEX_ACCOUNT_PIN');

    if (aramexUser && aramexPass && aramexAcct && aramexPin) {
      const liveRates = await fetchAramexRate(
        { username: aramexUser, password: aramexPass, accountNumber: aramexAcct, accountPin: aramexPin },
        fromAddress, toAddress, weightKg * parcels, this.logger,
      );
      if (liveRates?.length) rates.push(...liveRates);
    }

    // ── Try DHL live API ─────────────────────────────────────────────────
    const dhlId     = this.config.get<string>('DHL_CLIENT_ID');
    const dhlSecret = this.config.get<string>('DHL_CLIENT_SECRET');

    if (dhlId && dhlSecret) {
      const liveRates = await fetchDHLRate(
        { clientId: dhlId, clientSecret: dhlSecret },
        fromAddress, toAddress, weightKg * parcels, this.logger,
      );
      if (liveRates?.length) rates.push(...liveRates);
    }

    // ── SA rate tables (always computed — enrich or fill in when live missing) ─
    for (const entry of RATE_TABLE) {
      const cfg = carrierConfigs?.[entry.carrier];
      // Skip if carrier explicitly disabled
      if (cfg && !cfg.enabled) continue;

      // Skip table entries for carriers where we already have live rates
      const alreadyLive = rates.some(r => r.carrier === entry.carrier && r.source === 'live');
      if (alreadyLive) continue;

      const rate = calculateTableRate(entry, weightKg, parcels, zoneMult);

      // Apply tenant markup
      if (cfg && cfg.markupPct > 0) {
        const markup = cfg.markupPct / 100;
        rate.base         = Math.round(rate.base * (1 + markup) * 100) / 100;
        rate.fuelSurcharge = Math.round(rate.base * FUEL_SURCHARGE_PCT * 100) / 100;
        const preVat = rate.base + rate.fuelSurcharge;
        rate.vat   = Math.round(preVat * VAT_PCT * 100) / 100;
        rate.total = Math.round((preVat + rate.vat) * 100) / 100;
      }

      rates.push(rate);
    }

    // ── Sort by price, tag best/fastest ──────────────────────────────────
    rates.sort((a, b) => a.total - b.total);
    if (rates.length > 0) rates[0].bestValue = true;

    // Tag fastest (shortest transit)
    const dayOrder = ['next day', '1–2 days', '1-2 days', '2–3 days', '2-3 days', '3–5 days', '2–4 days'];
    const fastest = [...rates].sort((a, b) => {
      const ai = dayOrder.findIndex(d => a.transitDays.toLowerCase().includes(d));
      const bi = dayOrder.findIndex(d => b.transitDays.toLowerCase().includes(d));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })[0];
    if (fastest) fastest.fastest = true;

    return {
      rates,
      requestedAt: new Date().toISOString(),
      fromAddress, toAddress, weightKg, parcels,
    };
  }

  /** Return available carrier list so the UI can build settings toggles. */
  carriers() {
    return [...new Set(RATE_TABLE.map(r => r.carrier))];
  }
}
