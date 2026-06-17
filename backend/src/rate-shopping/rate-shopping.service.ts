import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ── SA province list ─────────────────────────────────────────────────────
export const SA_PROVINCES: Record<string, string> = {
  GP: 'Gauteng',
  WC: 'Western Cape',
  KZN: 'KwaZulu-Natal',
  EC: 'Eastern Cape',
  FS: 'Free State',
  NC: 'Northern Cape',
  NW: 'North West',
  LP: 'Limpopo',
  MP: 'Mpumalanga',
};

// ── Zone matrix — determines distance multiplier ─────────────────────────
// 1.0 = same province  /  1.1 = standard cross-province
// 1.2 = long-haul (e.g. GP→WC)  /  1.3 = remote
const ZONE_MATRIX: Record<string, Record<string, number>> = {
  GP: { GP:1.0, WC:1.2, KZN:1.1, EC:1.2, FS:1.0, NC:1.1, NW:1.0, LP:1.0, MP:1.0 },
  WC: { GP:1.2, WC:1.0, KZN:1.2, EC:1.1, FS:1.1, NC:1.1, NW:1.2, LP:1.3, MP:1.2 },
  KZN:{ GP:1.1, WC:1.2, KZN:1.0, EC:1.1, FS:1.1, NC:1.2, NW:1.2, LP:1.2, MP:1.1 },
  EC: { GP:1.2, WC:1.1, KZN:1.1, EC:1.0, FS:1.1, NC:1.2, NW:1.2, LP:1.3, MP:1.2 },
  FS: { GP:1.0, WC:1.1, KZN:1.1, EC:1.1, FS:1.0, NC:1.1, NW:1.0, LP:1.1, MP:1.0 },
  NC: { GP:1.1, WC:1.1, KZN:1.2, EC:1.2, FS:1.1, NC:1.0, NW:1.1, LP:1.2, MP:1.2 },
  NW: { GP:1.0, WC:1.2, KZN:1.2, EC:1.2, FS:1.0, NC:1.1, NW:1.0, LP:1.1, MP:1.1 },
  LP: { GP:1.0, WC:1.3, KZN:1.2, EC:1.3, FS:1.1, NC:1.2, NW:1.1, LP:1.0, MP:1.0 },
  MP: { GP:1.0, WC:1.2, KZN:1.1, EC:1.2, FS:1.0, NC:1.2, NW:1.1, LP:1.0, MP:1.0 },
};

// ── SA fuel surcharge (industry standard 2025) ────────────────────────────
const FUEL_SURCHARGE = 0.185; // 18.5%

// ── Weight bands (kg) and base rates (ZAR, pre-surcharge, Zone 1.0) ───────
// Source: publicly available SA carrier rate guides (2025 approximations)
//
// Band index: 0=0-0.5, 1=0.5-1, 2=1-2, 3=2-5, 4=5-10, 5=10-15, 6=15-20, 7=20-30
const WEIGHT_BANDS = [0.5, 1, 2, 5, 10, 15, 20, 30];

type ServiceRate = {
  service: string;
  label: string;
  transitDays: number;
  baseRates: number[]; // one per WEIGHT_BANDS index
};

const CARRIER_RATES: Record<string, { name: string; services: ServiceRate[] }> = {
  aramex: {
    name: 'Aramex South Africa',
    services: [
      {
        service: 'aramex_economy',
        label: 'Aramex Economy (1–3 days)',
        transitDays: 2,
        baseRates: [65, 85, 105, 130, 195, 255, 315, 395],
      },
      {
        service: 'aramex_express',
        label: 'Aramex Express (next day)',
        transitDays: 1,
        baseRates: [95, 115, 145, 185, 270, 350, 440, 560],
      },
    ],
  },
  dhl: {
    name: 'DHL Express South Africa',
    services: [
      {
        service: 'dhl_economy',
        label: 'DHL Economy (2–3 days)',
        transitDays: 2,
        baseRates: [78, 102, 126, 156, 234, 306, 378, 474],
      },
      {
        service: 'dhl_express',
        label: 'DHL Express (next day)',
        transitDays: 1,
        baseRates: [120, 155, 195, 245, 340, 455, 570, 720],
      },
    ],
  },
  postnet: {
    name: 'PostNet South Africa',
    services: [
      {
        service: 'postnet_standard',
        label: 'PostNet Standard (3–5 days)',
        transitDays: 4,
        baseRates: [45, 58, 75, 95, 145, 195, 240, 295],
      },
    ],
  },
  courier_it: {
    name: 'Courier IT',
    services: [
      {
        service: 'courier_it_standard',
        label: 'Courier IT Standard (1–2 days)',
        transitDays: 2,
        baseRates: [58, 78, 98, 120, 178, 235, 290, 360],
      },
      {
        service: 'courier_it_express',
        label: 'Courier IT Express (next day)',
        transitDays: 1,
        baseRates: [88, 110, 138, 170, 245, 320, 400, 500],
      },
    ],
  },
  ram: {
    name: 'RAM Couriers',
    services: [
      {
        service: 'ram_economy',
        label: 'RAM Economy (1–3 days)',
        transitDays: 2,
        baseRates: [60, 80, 100, 125, 185, 245, 300, 375],
      },
      {
        service: 'ram_express',
        label: 'RAM Express (next day)',
        transitDays: 1,
        baseRates: [90, 110, 138, 175, 255, 330, 415, 525],
      },
    ],
  },
};

export type RateResult = {
  carrierId: string;
  carrierName: string;
  serviceCode: string;
  serviceLabel: string;
  transitDays: number;
  baseRate: number;
  fuelSurcharge: number;
  markupAmount: number;
  totalRate: number;
  currency: string;
  zone: number;
  isEnabled: boolean;
};

export type CompareRequest = {
  weight: number;         // kg
  fromProvince: string;   // e.g. "GP"
  toProvince: string;     // e.g. "WC"
  parcels?: number;       // multiplier (default 1)
  carriersFilter?: string[]; // optional: limit to specific carriers
};

@Injectable()
export class RateShoppingService {
  constructor(private prisma: PrismaService) {}

  // ── Internal helpers ────────────────────────────────────────────────────

  private weightBandIndex(weight: number): number {
    for (let i = 0; i < WEIGHT_BANDS.length; i++) {
      if (weight <= WEIGHT_BANDS[i]) return i;
    }
    return WEIGHT_BANDS.length - 1;
  }

  private zoneMultiplier(from: string, to: string): number {
    return ZONE_MATRIX[from]?.[to] ?? 1.1;
  }

  private computeRate(
    baseRate: number,
    zone: number,
    parcels: number,
    markupPct: number,
  ): { base: number; surcharge: number; markup: number; total: number } {
    const base = Math.round(baseRate * zone * parcels * 100) / 100;
    const surcharge = Math.round(base * FUEL_SURCHARGE * 100) / 100;
    const markupAmount = Math.round((base + surcharge) * (markupPct / 100) * 100) / 100;
    const total = Math.round((base + surcharge + markupAmount) * 100) / 100;
    return { base, surcharge, markup: markupAmount, total };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Compare rates across all enabled carriers for the given parcel params. */
  async compareRates(companyId: string, req: CompareRequest): Promise<RateResult[]> {
    const { weight, fromProvince, toProvince, parcels = 1, carriersFilter } = req;

    // Load tenant carrier configs (enabled + markup)
    const configs = await this.prisma.carrierConfig.findMany({
      where: { companyId },
    });
    const configMap = new Map(configs.map((c) => [c.carrier, c]));

    const zone = this.zoneMultiplier(fromProvince, toProvince);
    const bandIdx = this.weightBandIndex(weight);

    const results: RateResult[] = [];

    for (const [carrierId, carrier] of Object.entries(CARRIER_RATES)) {
      if (carriersFilter?.length && !carriersFilter.includes(carrierId)) continue;

      const config = configMap.get(carrierId);
      const isEnabled = config ? config.isEnabled : true; // default enabled
      const markupPct = config?.markupPct ?? 0;

      for (const svc of carrier.services) {
        const { base, surcharge, markup, total } = this.computeRate(
          svc.baseRates[bandIdx],
          zone,
          parcels,
          markupPct,
        );
        results.push({
          carrierId,
          carrierName: carrier.name,
          serviceCode: svc.service,
          serviceLabel: svc.label,
          transitDays: svc.transitDays,
          baseRate: base,
          fuelSurcharge: surcharge,
          markupAmount: markup,
          totalRate: total,
          currency: 'ZAR',
          zone,
          isEnabled,
        });
      }
    }

    // Sort by total rate ascending — cheapest first
    return results.sort((a, b) => a.totalRate - b.totalRate);
  }

  /** List carrier configurations for the tenant (with defaults for missing). */
  async listCarriers(companyId: string) {
    const configs = await this.prisma.carrierConfig.findMany({
      where: { companyId },
    });
    const configMap = new Map(configs.map((c) => [c.carrier, c]));

    return Object.entries(CARRIER_RATES).map(([id, carrier]) => ({
      id,
      name: carrier.name,
      services: carrier.services.map((s) => s.label),
      isEnabled: configMap.get(id)?.isEnabled ?? true,
      markupPct: configMap.get(id)?.markupPct ?? 0,
      configId: configMap.get(id)?.id ?? null,
    }));
  }

  /** Upsert carrier configuration for a tenant. */
  async upsertCarrier(
    companyId: string,
    carrierId: string,
    dto: { isEnabled?: boolean; markupPct?: number },
  ) {
    return this.prisma.carrierConfig.upsert({
      where: { companyId_carrier: { companyId, carrier: carrierId } },
      create: {
        companyId,
        carrier: carrierId,
        isEnabled: dto.isEnabled ?? true,
        markupPct: dto.markupPct ?? 0,
      },
      update: {
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.markupPct !== undefined ? { markupPct: dto.markupPct } : {}),
      },
    });
  }

  /** Province list for the UI dropdowns. */
  listProvinces() {
    return Object.entries(SA_PROVINCES).map(([code, name]) => ({ code, name }));
  }
}
