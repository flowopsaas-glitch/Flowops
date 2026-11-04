import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';

/**
 * World-Class Per-Shipment Carbon Calculator
 *
 * Calculates CO2 emissions for every delivery based on:
 * - Distance (real road km from OSRM or haversine)
 * - Vehicle type (van, truck, motorcycle)
 * - Load factor (weight utilization)
 * - Fuel type (diesel, petrol, electric)
 *
 * Emission factors sourced from:
 * - UK DEFRA 2024 guidelines (industry standard)
 * - South African Department of Environment (local context)
 *
 * Provides:
 * - Per-shipment CO2 in kg
 * - Monthly/yearly fleet emissions
 * - Scope 3 reporting for corporate clients
 * - Carbon offset cost estimation
 */

// Emission factors in kg CO2 per km (includes well-to-wheel)
const EMISSION_FACTORS: Record<string, number> = {
  // Vans (< 3.5t)
  'VAN_DIESEL': 0.24927,        // DEFRA 2024: diesel van, average
  'VAN_PETROL': 0.23264,        // DEFRA 2024: petrol van
  'VAN_ELECTRIC': 0.05100,      // Grid average SA (Eskom heavy coal)
  // Trucks (3.5t - 7.5t)
  'TRUCK_SMALL_DIESEL': 0.48460,
  // Trucks (7.5t - 17t)
  'TRUCK_MEDIUM_DIESEL': 0.59740,
  // Trucks (> 17t articulated)
  'TRUCK_LARGE_DIESEL': 0.92840,
  // Motorcycles / bikes
  'MOTORCYCLE': 0.11380,
  'BICYCLE': 0.0,
  'E_BIKE': 0.00520,
  // Default (average SA delivery van)
  'DEFAULT': 0.24927,
};

// Vehicle type mapping from FlowOps vehicle types
const VEHICLE_MAP: Record<string, string> = {
  'motorcycle': 'MOTORCYCLE',
  // `Driver.vehicleType` defaults to "motorbike" in the schema, and a driver
  // created through the API without a type gets exactly that string. It was
  // missing here, so those drivers fell through to DEFAULT — the average diesel
  // van — and every shipment they touched reported 2.2x its real emissions in
  // fleet and client ESG reporting.
  'motorbike': 'MOTORCYCLE',
  'bike': 'MOTORCYCLE',
  'scooter': 'MOTORCYCLE',
  'van': 'VAN_DIESEL',
  'car': 'VAN_PETROL',
  'bakkie': 'VAN_DIESEL',
  'truck': 'TRUCK_SMALL_DIESEL',
  'medium_truck': 'TRUCK_MEDIUM_DIESEL',
  'large_truck': 'TRUCK_LARGE_DIESEL',
  'articulated': 'TRUCK_LARGE_DIESEL',
  'electric': 'VAN_ELECTRIC',
  'ev': 'VAN_ELECTRIC',
  'bicycle': 'BICYCLE',
  'e-bike': 'E_BIKE',
};

/**
 * The same map keyed by a normalised form, so "Medium Truck", "medium_truck"
 * and "medium-truck" cannot produce three different answers.
 *
 * The driver form posts free text and `Driver.vehicleType` is a plain string
 * with a default of "motorbike", so variation in spelling is a certainty, not
 * an edge case.
 */
const NORMALISED_VEHICLE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(VEHICLE_MAP).map(([key, value]) => [key.replace(/[_\s]+/g, '-'), value]),
);

export interface VehicleResolution {
  /** EMISSION_FACTORS key actually used. */
  key: string;
  factor: number;
  /**
   * Whether a recorded vehicle type was understood. `false` means the number
   * rests on the average-diesel-van assumption — which is a different statement
   * from "this is a van", and the report says so.
   */
  recognised: boolean;
  /** The value as recorded, trimmed. `null` when nothing was recorded. */
  input: string | null;
}

/**
 * Resolve a recorded vehicle type to an emission factor.
 *
 * Unknown values still resolve — a report that refuses to run is not more
 * honest, it is just less useful — but they resolve *visibly*: `recognised` is
 * false and `emissionAssumption` explains the substitution, so an operator can
 * see that "Isuzu FVR 850" is being counted as an average diesel van and go and
 * fix the master data.
 */
export function resolveVehicle(vehicleType?: string | null): VehicleResolution {
  const input = typeof vehicleType === 'string' && vehicleType.trim() ? vehicleType.trim() : null;
  if (!input) {
    return { key: 'DEFAULT', factor: EMISSION_FACTORS['DEFAULT'], recognised: false, input: null };
  }

  const lower = input.toLowerCase();
  const direct = VEHICLE_MAP[lower];
  const normalised = direct ?? NORMALISED_VEHICLE_MAP[lower.replace(/[_\s]+/g, '-')];
  if (normalised) {
    return { key: normalised, factor: EMISSION_FACTORS[normalised] ?? EMISSION_FACTORS['DEFAULT'], recognised: true, input };
  }
  return { key: 'DEFAULT', factor: EMISSION_FACTORS['DEFAULT'], recognised: false, input };
}

// Carbon offset price (USD per tonne CO2 — Gold Standard average)
const OFFSET_PRICE_USD_PER_TONNE = 15.0;
const USD_TO_ZAR = 18.5;

export interface CarbonCalculation {
  waybillId?: string;
  trackingNumber?: string;
  distanceKm: number;
  vehicleType: string;
  emissionFactor: number;
  co2Kg: number;
  co2Tonnes: number;
  offsetCostZar: number;
  methodology: string;
  /** False when the recorded vehicle type was not understood and a van was assumed. */
  vehicleTypeRecognised: boolean;
  /** Plain-language statement of the substitution, or null when nothing was assumed. */
  emissionAssumption: string | null;
}

export interface FleetCarbonReport {
  period: string;
  /** Waybills in scope for the period, whether or not their distance was known. */
  totalShipments: number;
  /** Waybills whose distance could be measured — the population the figures cover. */
  measuredShipments: number;
  /**
   * Waybills with no usable coordinates. They are excluded from every distance
   * and emission figure rather than charged at an assumed distance: a fleet's
   * total that quietly contains invented kilometres is worse than one that
   * states what it could not measure.
   */
  distanceNotMeasured: number;
  totalDistanceKm: number;
  totalCo2Kg: number;
  totalCo2Tonnes: number;
  avgCo2PerShipment: number;
  avgCo2PerKm: number;
  offsetCostZar: number;
  byVehicleType: Record<string, { shipments: number; co2Kg: number; distanceKm: number }>;
  /** Vehicle types recorded on drivers that matched no known type. */
  unrecognisedVehicleTypes: string[];
  byMonth: Array<{ month: string; co2Kg: number; shipments: number }>;
  reductionVsLastPeriod?: number;
  equivalents: {
    treesNeeded: number;
    flightsJhbCpt: number;
    householdDays: number;
  };
}

@Injectable()
export class CarbonService {
  private readonly logger = new Logger(CarbonService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate CO2 for a single shipment.
   */
  calculateShipment(distanceKm: number, vehicleType?: string, weightKg?: number): CarbonCalculation {
    const resolved = resolveVehicle(vehicleType);
    const mapped = resolved.key;
    // `??`, never `||`: BICYCLE has a factor of 0, which is falsy. With `||` a
    // zero-emission delivery fell through to DEFAULT (average diesel van), so a
    // bicycle courier's shipments were reported at ~0.249 kg CO2/km — the
    // platform contradicting the very claim that makes bicycle last-mile worth
    // selling.
    const factor = resolved.factor;

    // Weight-based adjustment: heavier loads = more fuel
    // Base factor assumes average load; adjust ±20% based on weight
    let weightMultiplier = 1.0;
    if (weightKg) {
      if (weightKg > 50) weightMultiplier = 1.15;
      else if (weightKg > 20) weightMultiplier = 1.05;
      else if (weightKg < 2) weightMultiplier = 0.90;
    }

    const co2Kg = Math.round(distanceKm * factor * weightMultiplier * 1000) / 1000;
    const co2Tonnes = Math.round(co2Kg / 1000 * 10000) / 10000;
    const offsetCostZar = Math.round(co2Tonnes * OFFSET_PRICE_USD_PER_TONNE * USD_TO_ZAR * 100) / 100;

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      vehicleType: mapped,
      emissionFactor: factor,
      co2Kg,
      co2Tonnes,
      offsetCostZar,
      methodology: 'DEFRA 2024 + SA grid factor (Eskom). Well-to-wheel emissions.',
      vehicleTypeRecognised: resolved.recognised,
      emissionAssumption: resolved.recognised
        ? null
        : resolved.input
          ? `"${resolved.input}" is not a recognised vehicle type — counted as an average diesel van.`
          : 'No vehicle type recorded — counted as an average diesel van.',
    };
  }

  /**
   * Calculate CO2 for a specific waybill (uses geocoded coordinates for distance).
   */
  async calculateWaybill(waybillId: string, companyId: string): Promise<CarbonCalculation> {
    const wb = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      select: {
        id: true, trackingNumber: true, weight: true,
        senderLat: true, senderLng: true,
        recipientLat: true, recipientLng: true,
        shipments: { select: { driver: { select: { vehicleType: true } } }, take: 1 },
      },
    });

    if (!wb) throw new Error('Waybill not found');

    let distanceKm = 10; // Default 10km if no coordinates
    if (wb.senderLat && wb.senderLng && wb.recipientLat && wb.recipientLng) {
      distanceKm = GeocodingService.haversineKm(
        wb.senderLat, wb.senderLng,
        wb.recipientLat, wb.recipientLng,
      ) * 1.3; // Road factor
    }

    const vehicleType = wb.shipments?.[0]?.driver?.vehicleType || undefined;
    const calc = this.calculateShipment(distanceKm, vehicleType, wb.weight ?? undefined);

    return { ...calc, waybillId: wb.id, trackingNumber: wb.trackingNumber };
  }

  /**
   * Fleet-wide carbon report for a company over a given period.
   */
  async getFleetReport(companyId: string, days = 30): Promise<FleetCarbonReport> {
    const since = new Date(Date.now() - days * 86_400_000);

    const waybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        createdAt: { gte: since },
        status: { in: ['DELIVERED', 'COLLECTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
      },
      select: {
        id: true, weight: true,
        senderLat: true, senderLng: true,
        recipientLat: true, recipientLng: true,
        createdAt: true,
        shipments: { select: { driver: { select: { vehicleType: true } } }, take: 1 },
      },
    });

    let totalCo2 = 0;
    let totalDist = 0;
    let measuredShipments = 0;
    let distanceNotMeasured = 0;
    const byVehicle: Record<string, { shipments: number; co2Kg: number; distanceKm: number }> = {};
    const byMonth: Record<string, { co2Kg: number; shipments: number }> = {};
    /** Recorded vehicle types that fell back to the average-van factor. */
    const unrecognised = new Set<string>();

    for (const wb of waybills) {
      // One resolver for both paths. The fleet report used to carry its own copy
      // of the mapping, which is how the bicycle and "motorbike" defects had to
      // be fixed twice; a divergence here would mean a shipment's figure and the
      // fleet total disagree.
      const resolved = resolveVehicle(wb.shipments?.[0]?.driver?.vehicleType);
      const mapped = resolved.key;
      if (!resolved.recognised && resolved.input) unrecognised.add(resolved.input);

      // Counts stay in scope terms: every waybill in the period is one shipment,
      // and it appears under its vehicle and its month even when its distance is
      // unknown. Only the distance and CO2 sums narrow to what was measured.
      if (!byVehicle[mapped]) byVehicle[mapped] = { shipments: 0, co2Kg: 0, distanceKm: 0 };
      byVehicle[mapped].shipments++;

      const monthKey = wb.createdAt.toISOString().slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { co2Kg: 0, shipments: 0 };
      byMonth[monthKey].shipments++;

      // No route, no kilometres. The report used to charge a flat 10 km here,
      // which put invented distance into the fleet total and every figure
      // derived from it (cost per km, the loaded/empty split, the offsets).
      const hasRoute = wb.senderLat != null && wb.senderLng != null
        && wb.recipientLat != null && wb.recipientLng != null;
      if (!hasRoute) {
        distanceNotMeasured += 1;
        continue;
      }

      const dist = GeocodingService.haversineKm(
        wb.senderLat as number, wb.senderLng as number,
        wb.recipientLat as number, wb.recipientLng as number,
      ) * 1.3;
      const co2 = dist * resolved.factor;

      totalCo2 += co2;
      totalDist += dist;
      measuredShipments += 1;
      byVehicle[mapped].co2Kg += co2;
      byVehicle[mapped].distanceKm += dist;
      byMonth[monthKey].co2Kg += co2;
    }

    const totalTonnes = totalCo2 / 1000;
    const offsetCost = Math.round(totalTonnes * OFFSET_PRICE_USD_PER_TONNE * USD_TO_ZAR * 100) / 100;

    return {
      period: `Last ${days} days`,
      totalShipments: waybills.length,
      measuredShipments,
      distanceNotMeasured,
      totalDistanceKm: Math.round(totalDist * 100) / 100,
      totalCo2Kg: Math.round(totalCo2 * 100) / 100,
      totalCo2Tonnes: Math.round(totalTonnes * 10000) / 10000,
      // Divided by what was measured, not by what was in scope: folding
      // unmeasured shipments into the denominator would understate every
      // shipment that was measured.
      avgCo2PerShipment: measuredShipments > 0 ? Math.round((totalCo2 / measuredShipments) * 100) / 100 : 0,
      avgCo2PerKm: totalDist > 0 ? Math.round((totalCo2 / totalDist) * 10000) / 10000 : 0,
      offsetCostZar: offsetCost,
      byVehicleType: Object.fromEntries(
        Object.entries(byVehicle).map(([k, v]) => [k, {
          shipments: v.shipments,
          co2Kg: Math.round(v.co2Kg * 100) / 100,
          distanceKm: Math.round(v.distanceKm * 100) / 100,
        }]),
      ),
      /**
       * Recorded vehicle types that were not understood and were costed as an
       * average diesel van. Surfaced so the master data can be fixed, rather
       * than leaving a fleet's totals resting on a substitution nobody can see.
       */
      unrecognisedVehicleTypes: [...unrecognised].sort(),
      byMonth: Object.entries(byMonth).map(([month, data]) => ({
        month,
        co2Kg: Math.round(data.co2Kg * 100) / 100,
        shipments: data.shipments,
      })).sort((a, b) => a.month.localeCompare(b.month)),
      equivalents: {
        treesNeeded: Math.ceil(totalTonnes / 0.022), // 1 tree absorbs ~22kg CO2/year
        flightsJhbCpt: Math.round(totalTonnes / 0.116 * 10) / 10, // JHB-CPT flight = 116kg CO2
        householdDays: Math.round(totalTonnes / (7.5 / 365) * 10) / 10, // SA household = 7.5t/year
      },
    };
  }
}
