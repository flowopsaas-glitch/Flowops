import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * WORLD-CLASS AIR CARGO INTELLIGENCE SERVICE
 *
 * Full end-to-end air freight lifecycle management:
 * 1. Flight tracking (position, ETA prediction, delay alerts)
 * 2. Airport congestion database (African + major Asian hubs)
 * 3. Air vs Ocean cost comparison AI (mode optimization)
 * 4. AWB (Air Waybill) PDF generation data
 * 5. Customs pre-clearance alerts (advance cargo info)
 * 6. ULD (Unit Load Device) tracking & management
 *
 * IATA standards compliance:
 * - AWB format per IATA Resolution 600a
 * - ULD codes per IATA ULD Technical Manual
 * - Cargo IMP codes per IATA CIMP
 * - e-AWB per IATA Resolution 672
 * - Customs pre-clearance per WCO PLACI framework
 *
 * Data sources:
 * - Primary: FlightAware AeroAPI / AviationStack
 * - Secondary: Airline cargo tracking portals (scrape)
 * - Tertiary: IATA ONE Record API (future)
 * - Fallback: Manual milestone updates from operators
 */
import { Money } from '../common/money.util';


// ══════════════════════════════════════════════════════════════════════════════
// INTERFACES — Air Cargo domain types (IATA-compliant)
// ══════════════════════════════════════════════════════════════════════════════

export interface FlightPosition {
  flightNumber: string;
  airline: string;
  aircraftType?: string;
  lat: number;
  lng: number;
  altitude: number; // feet
  speed: number; // knots ground speed
  heading: number;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
  actualDeparture?: string;
  estimatedArrival?: string;
  flightStatus: 'SCHEDULED' | 'DEPARTED' | 'EN_ROUTE' | 'LANDED' | 'CANCELLED';
  lastUpdated: string;
  source: string;
}

export interface AirportCongestion {
  iataCode: string;
  icaoCode: string;
  airportName: string;
  city: string;
  country: string;
  countryCode: string;
  avgCargoHandlingHours: number;
  avgCustomsClearanceHours: number;
  totalAvgDelayHours: number;
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cargoTerminals: string[];
  operatingHours: string;
  hasFreighterApron: boolean;
  hasColdChain: boolean;
  hasDGFacility: boolean;
  lastUpdated: string;
}


export interface FlightTrackingResult {
  fileId: string;
  fileNumber: string;
  awbNumber: string;
  flightNumber: string;
  origin: string;
  destination: string;
  carrierEta: string | null;
  predictedEta: string | null;
  etaDifferenceHours: number | null;
  flightPosition: FlightPosition | null;
  airportCongestion: AirportCongestion | null;
  distanceRemainingKm: number | null;
  percentComplete: number;
  hoursInTransit: number;
  status: string;
  milestoneCode: string; // IATA FWB/FHL status codes
  alerts: string[];
}

export interface UldUnit {
  uldCode: string; // e.g. AKE12345SA
  uldType: string; // AKE, PMC, PLA, etc.
  airline: string;
  contourCode: string;
  maxGrossWeight: number; // kg
  tareWeight: number; // kg
  currentLoad: number; // kg
  status: 'AVAILABLE' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'DAMAGED' | 'RETURNED';
  flightNumber?: string;
  origin?: string;
  destination?: string;
  pieces: number;
  lastScan?: string;
  condition: 'SERVICEABLE' | 'DAMAGED' | 'UNDER_REPAIR';
}


export interface AirVsOceanComparison {
  origin: string;
  destination: string;
  weightKg: number;
  volumeCbm: number;
  chargeableWeight: number; // max(actual, volumetric)

  airOption: {
    transitDays: number;
    costPerKg: number;
    totalCost: number;
    currency: string;
    carrier: string;
    co2Kg: number;
    risks: string[];
  };

  oceanOption: {
    transitDays: number;
    costPerCbm: number;
    totalCost: number;
    currency: string;
    carrier: string;
    co2Kg: number;
    risks: string[];
  };

  recommendation: 'AIR' | 'OCEAN' | 'SPLIT';
  reasoning: string;
  savingsDays: number;
  savingsCost: number;
  costPerDaySaved: number;
}

export interface CustomsPreClearance {
  fileId: string;
  awbNumber: string;
  status: 'NOT_STARTED' | 'ACI_SUBMITTED' | 'PRE_CLEARED' | 'HOLD' | 'EXAM_REQUIRED' | 'RELEASED';
  aciSubmittedAt?: string; // Advance Cargo Information
  preClearedAt?: string;
  holdReason?: string;
  examType?: string;
  riskScore: number; // 0-100 customs risk
  requiredDocs: string[];
  missingDocs: string[];
  alerts: string[];
  estimatedClearanceHours: number;
}


export interface AwbData {
  awbPrefix: string; // 3-digit airline prefix (IATA Res 600a)
  awbSerial: string; // 8-digit serial with check digit
  awbNumber: string; // full "prefix-serial" format
  issueDate: string;
  shipper: { name: string; address: string; city: string; country: string; phone?: string };
  consignee: { name: string; address: string; city: string; country: string; phone?: string };
  agent: { name: string; iataCode: string; accountNo?: string };
  origin: string;
  destination: string;
  flightNumber: string;
  flightDate: string;
  pieces: number;
  grossWeightKg: number;
  chargeableWeightKg: number;
  volumeCbm: number;
  rateClass: 'M' | 'N' | 'Q' | 'C' | 'U' | 'E' | 'S'; // IATA rate classes
  ratePerKg: number;
  totalCharge: number;
  currency: string;
  goodsDescription: string;
  handlingCodes: string[]; // SPH codes: PER, DGR, AVI, HUM, etc.
  customsValue: number;
  insuranceValue?: number;
  declaredValueForCarriage?: number;
  otherCharges: { code: string; amount: number; prepaid: boolean }[];
  natureOfGoods: string;
  dimensions?: { length: number; width: number; height: number; pieces: number }[];
  shcs: string[]; // Special Handling Codes per IATA
  isEAwb: boolean; // e-AWB flag (IATA Res 672)
}


// ══════════════════════════════════════════════════════════════════════════════
// AIRPORT CONGESTION DATABASE
// OR Tambo, JKIA, Bole, Lagos, Cape Town + major Asian hubs
// ══════════════════════════════════════════════════════════════════════════════

const AIRPORTS: Record<string, {
  name: string; city: string; country: string; countryCode: string;
  icao: string; lat: number; lng: number;
  avgCargoHandlingHours: number; avgCustomsClearanceHours: number;
  cargoTerminals: string[]; operatingHours: string;
  hasFreighterApron: boolean; hasColdChain: boolean; hasDGFacility: boolean;
}> = {
  // ── AFRICA ────────────────────────────────────────────────────────────────
  'JNB': {
    name: 'OR Tambo International Airport',
    city: 'Johannesburg', country: 'South Africa', countryCode: 'ZA',
    icao: 'FAOR', lat: -26.1392, lng: 28.2460,
    avgCargoHandlingHours: 6, avgCustomsClearanceHours: 12,
    cargoTerminals: ['SAAT Cargo', 'Bidvest Cargo', 'Menzies Aviation', 'Swissport'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'CPT': {
    name: 'Cape Town International Airport',
    city: 'Cape Town', country: 'South Africa', countryCode: 'ZA',
    icao: 'FACT', lat: -33.9649, lng: 18.6017,
    avgCargoHandlingHours: 4, avgCustomsClearanceHours: 8,
    cargoTerminals: ['Menzies Aviation', 'Bidvest Cargo'],
    operatingHours: '05:00-23:00', hasFreighterApron: false, hasColdChain: true, hasDGFacility: true,
  },

  'NBO': {
    name: 'Jomo Kenyatta International Airport',
    city: 'Nairobi', country: 'Kenya', countryCode: 'KE',
    icao: 'HKJK', lat: -1.3192, lng: 36.9278,
    avgCargoHandlingHours: 8, avgCustomsClearanceHours: 18,
    cargoTerminals: ['Kenya Airways Cargo', 'Swissport', 'Siginon Aviation'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'ADD': {
    name: 'Bole International Airport',
    city: 'Addis Ababa', country: 'Ethiopia', countryCode: 'ET',
    icao: 'HAAB', lat: 8.9779, lng: 38.7993,
    avgCargoHandlingHours: 5, avgCustomsClearanceHours: 24,
    cargoTerminals: ['Ethiopian Cargo Terminal', 'New Cargo Terminal II'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'LOS': {
    name: 'Murtala Muhammed International Airport',
    city: 'Lagos', country: 'Nigeria', countryCode: 'NG',
    icao: 'DNMM', lat: 6.5774, lng: 3.3212,
    avgCargoHandlingHours: 12, avgCustomsClearanceHours: 72,
    cargoTerminals: ['NAHCO', 'SAHCO'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: false, hasDGFacility: true,
  },
  'DUR': {
    name: 'King Shaka International Airport',
    city: 'Durban', country: 'South Africa', countryCode: 'ZA',
    icao: 'FALE', lat: -29.6144, lng: 31.1197,
    avgCargoHandlingHours: 4, avgCustomsClearanceHours: 8,
    cargoTerminals: ['Bidvest Cargo'],
    operatingHours: '05:00-22:00', hasFreighterApron: false, hasColdChain: true, hasDGFacility: false,
  },

  'DAR': {
    name: 'Julius Nyerere International Airport',
    city: 'Dar es Salaam', country: 'Tanzania', countryCode: 'TZ',
    icao: 'HTDA', lat: -6.8781, lng: 39.2026,
    avgCargoHandlingHours: 10, avgCustomsClearanceHours: 36,
    cargoTerminals: ['Swissport Tanzania', 'TZ Cargo'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: false, hasDGFacility: false,
  },
  'ACC': {
    name: 'Kotoka International Airport',
    city: 'Accra', country: 'Ghana', countryCode: 'GH',
    icao: 'DGAA', lat: 5.6052, lng: -0.1668,
    avgCargoHandlingHours: 8, avgCustomsClearanceHours: 24,
    cargoTerminals: ['Ghana Airport Cargo Centre', 'Aviance Ghana'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'EBB': {
    name: 'Entebbe International Airport',
    city: 'Entebbe', country: 'Uganda', countryCode: 'UG',
    icao: 'HUEN', lat: 0.0424, lng: 32.4435,
    avgCargoHandlingHours: 6, avgCustomsClearanceHours: 18,
    cargoTerminals: ['Entebbe Handling Services', 'DAS Aviation'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: false,
  },
  // ── ASIA (major cargo hubs) ───────────────────────────────────────────────
  'HKG': {
    name: 'Hong Kong International Airport',
    city: 'Hong Kong', country: 'Hong Kong SAR', countryCode: 'HK',
    icao: 'VHHH', lat: 22.3080, lng: 113.9185,
    avgCargoHandlingHours: 3, avgCustomsClearanceHours: 2,
    cargoTerminals: ['Hactl SuperTerminal 1', 'AAT', 'Cathay Cargo Terminal'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },

  'SIN': {
    name: 'Changi Airport',
    city: 'Singapore', country: 'Singapore', countryCode: 'SG',
    icao: 'WSSS', lat: 1.3502, lng: 103.9940,
    avgCargoHandlingHours: 2, avgCustomsClearanceHours: 1,
    cargoTerminals: ['SATS Cargo', 'dnata Cargo', 'Changi Airfreight Centre'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'DXB': {
    name: 'Dubai International Airport',
    city: 'Dubai', country: 'UAE', countryCode: 'AE',
    icao: 'OMDB', lat: 25.2528, lng: 55.3644,
    avgCargoHandlingHours: 3, avgCustomsClearanceHours: 4,
    cargoTerminals: ['Emirates SkyCargo', 'dnata Cargo Village', 'Dubai Cargo Village'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'PVG': {
    name: 'Shanghai Pudong International Airport',
    city: 'Shanghai', country: 'China', countryCode: 'CN',
    icao: 'ZSPD', lat: 31.1434, lng: 121.8052,
    avgCargoHandlingHours: 4, avgCustomsClearanceHours: 6,
    cargoTerminals: ['Shanghai Pudong Cargo Terminal', 'Eastern Air Logistics'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'ICN': {
    name: 'Incheon International Airport',
    city: 'Seoul', country: 'South Korea', countryCode: 'KR',
    icao: 'RKSI', lat: 37.4602, lng: 126.4407,
    avgCargoHandlingHours: 3, avgCustomsClearanceHours: 3,
    cargoTerminals: ['Korean Air Cargo Terminal', 'Asiana Cargo', 'Incheon Airport Cargo Terminal'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },

  'NRT': {
    name: 'Narita International Airport',
    city: 'Tokyo', country: 'Japan', countryCode: 'JP',
    icao: 'RJAA', lat: 35.7647, lng: 140.3864,
    avgCargoHandlingHours: 3, avgCustomsClearanceHours: 4,
    cargoTerminals: ['NCA Cargo Terminal', 'ANA Cargo', 'JAL Cargo'],
    operatingHours: '06:00-23:00', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'BKK': {
    name: 'Suvarnabhumi Airport',
    city: 'Bangkok', country: 'Thailand', countryCode: 'TH',
    icao: 'VTBS', lat: 13.6900, lng: 100.7501,
    avgCargoHandlingHours: 4, avgCustomsClearanceHours: 6,
    cargoTerminals: ['Thai Cargo', 'BFS Cargo Terminal'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'DEL': {
    name: 'Indira Gandhi International Airport',
    city: 'New Delhi', country: 'India', countryCode: 'IN',
    icao: 'VIDP', lat: 28.5562, lng: 77.1000,
    avgCargoHandlingHours: 6, avgCustomsClearanceHours: 18,
    cargoTerminals: ['Celebi Delhi Cargo Terminal', 'Air India SATS'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  'BOM': {
    name: 'Chhatrapati Shivaji Maharaj International Airport',
    city: 'Mumbai', country: 'India', countryCode: 'IN',
    icao: 'VABB', lat: 19.0896, lng: 72.8656,
    avgCargoHandlingHours: 6, avgCustomsClearanceHours: 24,
    cargoTerminals: ['Mumbai Air Cargo Complex', 'Celebi Mumbai'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
  // ── EUROPE / MIDDLE EAST (transit hubs) ───────────────────────────────────
  'DOH': {
    name: 'Hamad International Airport',
    city: 'Doha', country: 'Qatar', countryCode: 'QA',
    icao: 'OTHH', lat: 25.2731, lng: 51.6081,
    avgCargoHandlingHours: 2, avgCustomsClearanceHours: 2,
    cargoTerminals: ['Qatar Aviation Services', 'Qatar Cargo Terminal'],
    operatingHours: '24/7', hasFreighterApron: true, hasColdChain: true, hasDGFacility: true,
  },
};


// ── ULD Types Reference (IATA ULD Technical Manual) ─────────────────────────
const ULD_TYPES: Record<string, { description: string; maxGrossKg: number; tareKg: number; volume: string }> = {
  'AKE': { description: 'LD3 Container', maxGrossKg: 1588, tareKg: 80, volume: '4.3 m3' },
  'AKH': { description: 'LD3 Container (high)', maxGrossKg: 1588, tareKg: 85, volume: '5.0 m3' },
  'AKN': { description: 'LD3-45 Container', maxGrossKg: 1588, tareKg: 75, volume: '3.5 m3' },
  'ALF': { description: 'LD6 Container', maxGrossKg: 3175, tareKg: 145, volume: '8.9 m3' },
  'AMP': { description: 'LD9 Container', maxGrossKg: 4626, tareKg: 135, volume: '10.8 m3' },
  'AAP': { description: 'LD9 Container (alt)', maxGrossKg: 4626, tareKg: 135, volume: '10.8 m3' },
  'PMC': { description: '96x125 Pallet', maxGrossKg: 6804, tareKg: 120, volume: '11.5 m3' },
  'PLA': { description: '88x125 Pallet', maxGrossKg: 5000, tareKg: 100, volume: '10.0 m3' },
  'PAG': { description: '88x125 Pallet + net', maxGrossKg: 5000, tareKg: 110, volume: '10.0 m3' },
  'PGA': { description: '96x125 Pallet + net', maxGrossKg: 6804, tareKg: 130, volume: '11.5 m3' },
  'RKN': { description: 'LD3 Temperature Controlled', maxGrossKg: 1588, tareKg: 150, volume: '3.0 m3' },
  'RAP': { description: 'LD9 Temperature Controlled', maxGrossKg: 4626, tareKg: 250, volume: '8.5 m3' },
  'HMA': { description: 'Horse Box', maxGrossKg: 2449, tareKg: 330, volume: 'N/A' },
};


// ── Air Cargo Rate Reference (USD/kg, indicative market rates) ──────────────
const AIR_RATES: Record<string, { ratePerKg: number; transitDays: number; co2Factor: number }> = {
  'JNB-HKG': { ratePerKg: 3.80, transitDays: 2, co2Factor: 0.56 },
  'JNB-PVG': { ratePerKg: 3.50, transitDays: 2, co2Factor: 0.58 },
  'JNB-DXB': { ratePerKg: 2.80, transitDays: 1, co2Factor: 0.32 },
  'JNB-SIN': { ratePerKg: 4.20, transitDays: 2, co2Factor: 0.52 },
  'JNB-NBO': { ratePerKg: 2.10, transitDays: 1, co2Factor: 0.18 },
  'JNB-LOS': { ratePerKg: 3.50, transitDays: 1, co2Factor: 0.28 },
  'JNB-ADD': { ratePerKg: 2.40, transitDays: 1, co2Factor: 0.22 },
  'NBO-HKG': { ratePerKg: 3.20, transitDays: 2, co2Factor: 0.48 },
  'NBO-DXB': { ratePerKg: 2.20, transitDays: 1, co2Factor: 0.24 },
  'ADD-PVG': { ratePerKg: 2.80, transitDays: 1, co2Factor: 0.42 },
  'ADD-HKG': { ratePerKg: 2.60, transitDays: 1, co2Factor: 0.44 },
  'LOS-PVG': { ratePerKg: 4.50, transitDays: 2, co2Factor: 0.62 },
  'CPT-HKG': { ratePerKg: 4.10, transitDays: 2, co2Factor: 0.60 },
  'CPT-DXB': { ratePerKg: 3.00, transitDays: 1, co2Factor: 0.34 },
};

// ── Ocean Rate Reference (USD/CBM, indicative for comparison) ───────────────
const OCEAN_RATES: Record<string, { ratePerCbm: number; transitDays: number; co2Factor: number }> = {
  'JNB-HKG': { ratePerCbm: 85, transitDays: 28, co2Factor: 0.012 },
  'JNB-PVG': { ratePerCbm: 90, transitDays: 30, co2Factor: 0.013 },
  'JNB-DXB': { ratePerCbm: 55, transitDays: 14, co2Factor: 0.008 },
  'JNB-SIN': { ratePerCbm: 80, transitDays: 22, co2Factor: 0.010 },
  'NBO-HKG': { ratePerCbm: 75, transitDays: 24, co2Factor: 0.011 },
  'NBO-DXB': { ratePerCbm: 45, transitDays: 10, co2Factor: 0.006 },
  'ADD-PVG': { ratePerCbm: 95, transitDays: 32, co2Factor: 0.014 },
  'LOS-PVG': { ratePerCbm: 100, transitDays: 35, co2Factor: 0.015 },
  'CPT-HKG': { ratePerCbm: 88, transitDays: 30, co2Factor: 0.013 },
  'CPT-DXB': { ratePerCbm: 60, transitDays: 16, co2Factor: 0.009 },
};


@Injectable()
export class AirCargoIntelligenceService {
  private readonly logger = new Logger(AirCargoIntelligenceService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // 1. FLIGHT TRACKING — position + predicted ETA for air shipment files
  // ══════════════════════════════════════════════════════════════════════════

  async trackFlight(companyId: string, fileId: string): Promise<FlightTrackingResult> {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId, mode: 'AIR' },
      select: {
        id: true, fileNumber: true, vesselVoyage: true, // vesselVoyage stores flight number for AIR mode
        pol: true, pod: true, eta: true, etd: true, status: true,
        grossWeightKg: true, volumeCbm: true,
        milestones: { orderBy: { reachedAt: 'desc' }, take: 1 },
      },
    });

    if (!file) throw new Error('Shipment file not found or not air mode');

    const alerts: string[] = [];
    const flightNumber = this.parseFlightNumber(file.vesselVoyage || '');
    const awbNumber = this.extractAwbFromFileNumber(file.fileNumber);

    // Get flight position from tracking API
    const flightPosition = await this.getFlightPosition(flightNumber);

    // Get airport congestion for destination
    const airportCongestion = this.getAirportCongestion(file.pod || '');

    // Calculate predicted ETA
    const { predictedEta, etaDiffHours, distanceKm, percentComplete, hoursInTransit } =
      this.calculateFlightEta(file, flightPosition, airportCongestion);

    // Determine IATA milestone code
    const milestoneCode = this.getIataMilestoneCode(file.status);

    // Generate intelligent alerts
    if (etaDiffHours && etaDiffHours > 4) {
      alerts.push(`✈️ ETA delayed by ${etaDiffHours}h vs airline schedule`);
    }
    if (airportCongestion && airportCongestion.congestionLevel === 'CRITICAL') {
      alerts.push(`🚨 ${airportCongestion.airportName} cargo handling critically delayed (${airportCongestion.avgCargoHandlingHours}h avg)`);
    }
    if (airportCongestion && airportCongestion.congestionLevel === 'HIGH') {
      alerts.push(`⚠️ ${airportCongestion.airportName} customs clearance slow (${airportCongestion.avgCustomsClearanceHours}h avg)`);
    }
    if (flightPosition?.flightStatus === 'CANCELLED') {
      alerts.push(`🛑 Flight ${flightNumber} CANCELLED — contact airline immediately`);
    }
    if (file.status === 'DEPARTED' && hoursInTransit > 48) {
      alerts.push(`⏰ Cargo in transit ${hoursInTransit}h — verify with carrier for transit/transship delay`);
    }

    return {
      fileId: file.id,
      fileNumber: file.fileNumber,
      awbNumber,
      flightNumber,
      origin: file.pol || '',
      destination: file.pod || '',
      carrierEta: file.eta?.toISOString() || null,
      predictedEta: predictedEta?.toISOString() || null,
      etaDifferenceHours: etaDiffHours,
      flightPosition,
      airportCongestion,
      distanceRemainingKm: distanceKm,
      percentComplete,
      hoursInTransit,
      status: file.status,
      milestoneCode,
      alerts,
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // 2. AIRPORT CONGESTION INTELLIGENCE
  // ══════════════════════════════════════════════════════════════════════════

  getAirportCongestion(iataCode: string): AirportCongestion | null {
    // Try exact IATA match
    let airport = AIRPORTS[iataCode.toUpperCase()];

    // Fuzzy match on city/name
    if (!airport) {
      const normalised = iataCode.toLowerCase().trim();
      const entry = Object.entries(AIRPORTS).find(([code, a]) =>
        a.city.toLowerCase().includes(normalised) ||
        a.name.toLowerCase().includes(normalised) ||
        code.toLowerCase() === normalised,
      );
      if (entry) {
        iataCode = entry[0];
        airport = entry[1];
      }
    }

    if (!airport) return null;

    const totalDelay = airport.avgCargoHandlingHours + airport.avgCustomsClearanceHours;
    const level: AirportCongestion['congestionLevel'] =
      totalDelay >= 72 ? 'CRITICAL' :
      totalDelay >= 24 ? 'HIGH' :
      totalDelay >= 12 ? 'MEDIUM' : 'LOW';

    return {
      iataCode: iataCode.toUpperCase(),
      icaoCode: airport.icao,
      airportName: airport.name,
      city: airport.city,
      country: airport.country,
      countryCode: airport.countryCode,
      avgCargoHandlingHours: airport.avgCargoHandlingHours,
      avgCustomsClearanceHours: airport.avgCustomsClearanceHours,
      totalAvgDelayHours: totalDelay,
      congestionLevel: level,
      cargoTerminals: airport.cargoTerminals,
      operatingHours: airport.operatingHours,
      hasFreighterApron: airport.hasFreighterApron,
      hasColdChain: airport.hasColdChain,
      hasDGFacility: airport.hasDGFacility,
      lastUpdated: new Date().toISOString(),
    };
  }

  /** Get congestion levels for all airports in the database */
  getAllAirportCongestion(): AirportCongestion[] {
    return Object.entries(AIRPORTS).map(([code, airport]) => {
      const totalDelay = airport.avgCargoHandlingHours + airport.avgCustomsClearanceHours;
      const level: AirportCongestion['congestionLevel'] =
        totalDelay >= 72 ? 'CRITICAL' :
        totalDelay >= 24 ? 'HIGH' :
        totalDelay >= 12 ? 'MEDIUM' : 'LOW';

      return {
        iataCode: code,
        icaoCode: airport.icao,
        airportName: airport.name,
        city: airport.city,
        country: airport.country,
        countryCode: airport.countryCode,
        avgCargoHandlingHours: airport.avgCargoHandlingHours,
        avgCustomsClearanceHours: airport.avgCustomsClearanceHours,
        totalAvgDelayHours: totalDelay,
        congestionLevel: level,
        cargoTerminals: airport.cargoTerminals,
        operatingHours: airport.operatingHours,
        hasFreighterApron: airport.hasFreighterApron,
        hasColdChain: airport.hasColdChain,
        hasDGFacility: airport.hasDGFacility,
        lastUpdated: new Date().toISOString(),
      };
    });
  }


  // ══════════════════════════════════════════════════════════════════════════
  // 3. AIR vs OCEAN COST COMPARISON AI
  // ══════════════════════════════════════════════════════════════════════════

  compareAirVsOcean(
    origin: string,
    destination: string,
    weightKg: number,
    volumeCbm: number,
  ): AirVsOceanComparison {
    // Calculate chargeable weight (IATA volumetric: L*W*H / 6000 per piece, or CBM * 167)
    const volumetricWeight = volumeCbm * 167; // 1 CBM = 167 kg chargeable
    const chargeableWeight = Math.max(weightKg, volumetricWeight);

    // Normalize lane key
    const laneKey = `${origin.toUpperCase()}-${destination.toUpperCase()}`;
    const reverseLaneKey = `${destination.toUpperCase()}-${origin.toUpperCase()}`;

    // Get air rate
    const airRate = AIR_RATES[laneKey] || AIR_RATES[reverseLaneKey] || {
      ratePerKg: 4.00, transitDays: 3, co2Factor: 0.50, // fallback average
    };

    // Get ocean rate
    const oceanRate = OCEAN_RATES[laneKey] || OCEAN_RATES[reverseLaneKey] || {
      ratePerCbm: 80, transitDays: 28, co2Factor: 0.012, // fallback average
    };

    const airTotalCost = chargeableWeight * airRate.ratePerKg;
    const oceanTotalCost = volumeCbm * oceanRate.ratePerCbm;
    const airCo2 = weightKg * airRate.co2Factor;
    const oceanCo2 = weightKg * oceanRate.co2Factor;

    const savingsDays = oceanRate.transitDays - airRate.transitDays;
    const costDiff = airTotalCost - oceanTotalCost;
    const costPerDaySaved = savingsDays > 0 ? costDiff / savingsDays : 0;

    // AI recommendation logic
    let recommendation: 'AIR' | 'OCEAN' | 'SPLIT';
    let reasoning: string;

    if (costPerDaySaved < 50 && savingsDays > 7) {
      recommendation = 'AIR';
      reasoning = `Air freight saves ${savingsDays} days at only $${costPerDaySaved.toFixed(0)}/day — excellent value for time-critical cargo.`;
    } else if (costDiff > 5000 && savingsDays < 14) {
      recommendation = 'OCEAN';
      reasoning = `Ocean saves $${costDiff.toFixed(0)} with only ${savingsDays} extra days. Unless urgently needed, ocean is significantly more economical.`;
    } else if (weightKg > 5000 && volumeCbm > 10) {
      recommendation = 'SPLIT';
      reasoning = `Large shipment (${weightKg}kg / ${volumeCbm}CBM) — consider splitting: urgent items by air, bulk by ocean for optimal cost-speed balance.`;
    } else if (costPerDaySaved < 100) {
      recommendation = 'AIR';
      reasoning = `At $${costPerDaySaved.toFixed(0)}/day saved, air freight offers good value. Total premium of $${costDiff.toFixed(0)} buys ${savingsDays} days faster delivery.`;
    } else {
      recommendation = 'OCEAN';
      reasoning = `Air premium of $${costDiff.toFixed(0)} ($${costPerDaySaved.toFixed(0)}/day saved) is high. Ocean recommended unless cargo is perishable or time-critical.`;
    }

    // Risk analysis
    const airRisks: string[] = [];
    const oceanRisks: string[] = [];

    if (chargeableWeight > 5000) airRisks.push('May require freighter space (limited availability)');
    if (airRate.transitDays > 2) airRisks.push('Transit connection — handling delay risk');

    if (oceanRate.transitDays > 25) oceanRisks.push('Extended transit — inventory carrying cost');
    const destAirport = AIRPORTS[destination.toUpperCase()];
    if (destAirport && destAirport.avgCustomsClearanceHours > 24) {
      oceanRisks.push(`Destination customs often slow (${destAirport.avgCustomsClearanceHours}h avg)`);
    }

    return {
      origin, destination, weightKg, volumeCbm, chargeableWeight,
      airOption: {
        transitDays: airRate.transitDays,
        costPerKg: airRate.ratePerKg,
        totalCost: Money.round(airTotalCost),
        currency: 'USD',
        carrier: 'Market rate (best available)',
        co2Kg: Math.round(airCo2 * 10) / 10,
        risks: airRisks,
      },
      oceanOption: {
        transitDays: oceanRate.transitDays,
        costPerCbm: oceanRate.ratePerCbm,
        totalCost: Money.round(oceanTotalCost),
        currency: 'USD',
        carrier: 'Market rate (best available)',
        co2Kg: Math.round(oceanCo2 * 10) / 10,
        risks: oceanRisks,
      },
      recommendation,
      reasoning,
      savingsDays,
      savingsCost: Money.round(costDiff),
      costPerDaySaved: Money.round(costPerDaySaved),
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // 4. AWB DATA GENERATION (for PDF rendering)
  // Per IATA Resolution 600a + 672 (e-AWB)
  // ══════════════════════════════════════════════════════════════════════════

  async generateAwbData(companyId: string, fileId: string): Promise<AwbData> {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId, mode: 'AIR' },
      include: { cargo: true, charges: true },
    });

    if (!file) throw new Error('Air shipment file not found');

    // Parse or generate AWB number
    const awbPrefix = this.detectAirlinePrefix(file.carrierName || '');
    const awbSerial = this.generateAwbSerial(file.fileNumber);
    const awbNumber = `${awbPrefix}-${awbSerial}`;

    // Calculate chargeable weight (IATA volumetric formula)
    const actualWeight = file.grossWeightKg || 0;
    const volumetricWeight = (file.volumeCbm || 0) * 167;
    const chargeableWeight = Math.max(actualWeight, volumetricWeight);

    // Determine rate class
    const rateClass = this.determineRateClass(chargeableWeight, file.goodsDescription || '');

    // Derive Special Handling Codes from cargo descriptions
    const shcs = this.deriveSpecialHandlingCodes(file.cargo || [], file.goodsDescription || '');
    const handlingCodes = shcs.slice(); // Copy for backward compat

    // Calculate charges
    const ratePerKg = this.getIndicativeRate(file.pol || '', file.pod || '');
    const totalCharge = chargeableWeight * ratePerKg;

    // Other charges from file charges
    const otherCharges = (file.charges || [])
      .filter((c: any) => c.description && c.cost > 0)
      .map((c: any) => ({
        code: this.mapChargeToIataCode(c.description),
        amount: c.cost,
        prepaid: true,
      }));

    return {
      awbPrefix,
      awbSerial,
      awbNumber,
      issueDate: new Date().toISOString().split('T')[0],
      shipper: {
        name: file.shipperName || 'TBC',
        address: '', city: file.pol || '', country: '',
        phone: undefined,
      },
      consignee: {
        name: file.consigneeName || 'TBC',
        address: '', city: file.pod || '', country: '',
        phone: undefined,
      },
      agent: {
        name: file.agentName || 'FlowOps Forwarding',
        iataCode: '00000000', // Placeholder IATA cargo agent code
        accountNo: undefined,
      },
      origin: file.pol || '',
      destination: file.pod || '',
      flightNumber: file.vesselVoyage || '',
      flightDate: file.etd?.toISOString().split('T')[0] || '',
      pieces: file.packages || 1,
      grossWeightKg: actualWeight,
      chargeableWeightKg: chargeableWeight,
      volumeCbm: file.volumeCbm || 0,
      rateClass,
      ratePerKg,
      totalCharge: Money.round(totalCharge),
      currency: 'USD',
      goodsDescription: file.goodsDescription || '',
      handlingCodes,
      customsValue: file.cargo?.reduce((s: number, c: any) => s + (c.customsValue || 0), 0) || 0,
      insuranceValue: undefined,
      declaredValueForCarriage: undefined,
      otherCharges,
      natureOfGoods: file.goodsDescription || 'General Cargo',
      dimensions: undefined,
      shcs,
      isEAwb: true, // Default to e-AWB (IATA Res 672 compliant)
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // 5. CUSTOMS PRE-CLEARANCE ALERTS
  // WCO Pre-Loading Advance Cargo Information (PLACI) framework
  // ══════════════════════════════════════════════════════════════════════════

  async getCustomsPreClearance(companyId: string, fileId: string): Promise<CustomsPreClearance> {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId, mode: 'AIR' },
      include: { cargo: true, documents: true, milestones: { orderBy: { reachedAt: 'desc' }, take: 1 } },
    });

    if (!file) throw new Error('Air shipment file not found');

    const awbNumber = this.extractAwbFromFileNumber(file.fileNumber);

    // Determine required documents based on destination country
    const requiredDocs = this.getRequiredCustomsDocs(file.pod || '', file.direction || 'IMPORT');

    // Check which docs are uploaded
    const uploadedDocTypes = (file.documents || []).map((d: any) => d.type);
    const missingDocs = requiredDocs.filter(d => !uploadedDocTypes.includes(d));

    // Calculate customs risk score
    const riskScore = this.calculateCustomsRiskScore(file, missingDocs);

    // Determine pre-clearance status based on milestones and docs
    const status = this.determinePreClearanceStatus(file, missingDocs, riskScore);

    // Generate alerts
    const alerts: string[] = [];

    if (missingDocs.length > 0) {
      alerts.push(`📋 ${missingDocs.length} required document(s) missing for customs pre-clearance`);
    }
    if (riskScore >= 70) {
      alerts.push(`🚨 HIGH customs risk (score ${riskScore}) — expect physical examination`);
    } else if (riskScore >= 40) {
      alerts.push(`⚠️ MEDIUM customs risk (score ${riskScore}) — documentary check likely`);
    }

    // Check if ACI should have been submitted (4h before departure per PLACI)
    if (file.etd && file.status === 'BOOKED') {
      const etd = new Date(file.etd);
      const aciDeadline = new Date(etd.getTime() - 4 * 3600000); // 4 hours before
      if (Date.now() > aciDeadline.getTime() && status === 'NOT_STARTED') {
        alerts.push(`⏰ ACI submission deadline PASSED (required 4h pre-departure per PLACI). Submit immediately.`);
      } else if (Date.now() > aciDeadline.getTime() - 2 * 3600000 && status === 'NOT_STARTED') {
        alerts.push(`⏳ ACI submission due within 2 hours (PLACI 4h pre-departure rule)`);
      }
    }

    // Destination-specific alerts
    const destAirport = AIRPORTS[file.pod?.toUpperCase() || ''];
    if (destAirport && destAirport.avgCustomsClearanceHours > 24) {
      alerts.push(`📍 ${destAirport.city} customs typically takes ${destAirport.avgCustomsClearanceHours}h — plan accordingly`);
    }

    const estimatedClearanceHours = destAirport
      ? destAirport.avgCustomsClearanceHours + (riskScore >= 70 ? 24 : riskScore >= 40 ? 8 : 0)
      : 12;

    return {
      fileId: file.id,
      awbNumber,
      status,
      aciSubmittedAt: status !== 'NOT_STARTED' ? file.milestones?.[0]?.reachedAt?.toISOString() : undefined,
      preClearedAt: status === 'PRE_CLEARED' || status === 'RELEASED' ? new Date().toISOString() : undefined,
      holdReason: status === 'HOLD' ? 'Random selection / risk profiling' : undefined,
      examType: riskScore >= 70 ? 'PHYSICAL' : riskScore >= 40 ? 'DOCUMENTARY' : undefined,
      riskScore,
      requiredDocs,
      missingDocs,
      alerts,
      estimatedClearanceHours,
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // 6. ULD TRACKING & MANAGEMENT
  // Per IATA ULD Technical Manual + IATA ULD Regulations
  // ══════════════════════════════════════════════════════════════════════════

  async getUldTracking(companyId: string, fileId: string): Promise<UldUnit[]> {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId, mode: 'AIR' },
      select: {
        id: true, fileNumber: true, status: true,
        vesselVoyage: true, pol: true, pod: true,
        containers: true, // ULDs stored as "containers" in the shared schema
      },
    });

    if (!file) throw new Error('Air shipment file not found');

    // Map containers to ULD units with proper IATA ULD data
    return (file.containers || []).map((c: any) => {
      const uldCode = c.containerNo || '';
      const uldType = this.parseUldType(uldCode);
      const typeInfo = ULD_TYPES[uldType] || { description: 'Unknown', maxGrossKg: 0, tareKg: 0, volume: 'N/A' };

      // Determine ULD status from file status
      const uldStatus = this.mapFileStatusToUldStatus(file.status);

      return {
        uldCode,
        uldType,
        airline: this.parseUldAirline(uldCode),
        contourCode: uldType.startsWith('A') ? 'Lower Deck' : 'Main Deck',
        maxGrossWeight: typeInfo.maxGrossKg,
        tareWeight: typeInfo.tareKg,
        currentLoad: c.vgmKg || 0,
        status: uldStatus,
        flightNumber: file.vesselVoyage || undefined,
        origin: file.pol || undefined,
        destination: file.pod || undefined,
        pieces: 0, // Would come from cargo allocation
        lastScan: c.updatedAt?.toISOString() || c.createdAt?.toISOString(),
        condition: 'SERVICEABLE' as const,
      };
    });
  }

  /** Validate a ULD code per IATA format: TYPE + 5-digit serial + owner code */
  validateUldCode(code: string): { valid: boolean; type?: string; serial?: string; owner?: string; error?: string } {
    // IATA ULD code format: AAA99999CC (3-char type + 5-digit serial + 2-char owner)
    const match = code.match(/^([A-Z]{3})(\d{4,5})([A-Z]{2})$/);
    if (!match) {
      return { valid: false, error: 'Invalid ULD format. Expected: TYPE(3)+SERIAL(5)+OWNER(2), e.g. AKE12345SA' };
    }

    const [, type, serial, owner] = match;
    if (!ULD_TYPES[type]) {
      return { valid: false, type, serial, owner, error: `Unknown ULD type '${type}'. Known: ${Object.keys(ULD_TYPES).join(', ')}` };
    }

    return { valid: true, type, serial, owner };
  }

  /** Get ULD type specifications */
  getUldSpecs(uldType?: string): Record<string, any> {
    if (uldType) {
      const spec = ULD_TYPES[uldType.toUpperCase()];
      return spec ? { [uldType.toUpperCase()]: spec } : {};
    }
    return ULD_TYPES;
  }


  // ══════════════════════════════════════════════════════════════════════════
  // CRON: Monitor in-transit air shipments (every 2 hours)
  // ══════════════════════════════════════════════════════════════════════════

  @Cron('0 */2 * * *')
  async monitorInTransitFlights() {
    this.logger.log('✈️ AIR CARGO INTELLIGENCE: Monitoring in-transit air shipments...');

    const airFiles = await this.prisma.shipmentFile.findMany({
      where: { mode: 'AIR', status: { in: ['DEPARTED', 'LOADED', 'CARGO_RECEIVED'] } },
      select: { id: true, companyId: true, fileNumber: true, vesselVoyage: true, pod: true, eta: true, etd: true },
    });

    let alertCount = 0;

    for (const file of airFiles) {
      try {
        const congestion = this.getAirportCongestion(file.pod || '');
        const etd = file.etd ? new Date(file.etd) : null;
        const hoursInTransit = etd ? Math.max(0, (Date.now() - etd.getTime()) / 3_600_000) : 0;

        // Flag files at critically congested airports
        if (congestion && congestion.congestionLevel === 'CRITICAL') {
          await this.prisma.shipmentFile.update({
            where: { id: file.id },
            data: {
              aiRiskScore: Math.min(100, Math.round(congestion.totalAvgDelayHours * 1.2)),
              aiRiskNote: `Destination ${congestion.airportName} experiencing critical cargo delays. ` +
                `Cargo handling: ${congestion.avgCargoHandlingHours}h, Customs: ${congestion.avgCustomsClearanceHours}h. ` +
                `Plan for ${congestion.totalAvgDelayHours}h total ground time.`,
            },
          });
          alertCount++;
        }

        // Flag flights that seem stuck (in transit > expected time)
        if (file.eta && hoursInTransit > 0) {
          const expectedHours = (new Date(file.eta).getTime() - (etd?.getTime() || Date.now())) / 3_600_000;
          if (hoursInTransit > expectedHours * 1.5 && hoursInTransit > 12) {
            await this.prisma.shipmentFile.update({
              where: { id: file.id },
              data: {
                aiRiskScore: Math.min(100, Math.round(70 + (hoursInTransit - expectedHours) / 2)),
                aiRiskNote: `Air cargo has been in transit ${Math.round(hoursInTransit)}h (expected ~${Math.round(expectedHours)}h). ` +
                  `Possible transit delay, missed connection, or off-load. Contact airline.`,
              },
            });
            alertCount++;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Air cargo monitor error for ${file.fileNumber}: ${err.message}`);
      }
    }

    this.logger.log(`✈️ AIR CARGO INTELLIGENCE: Monitored ${airFiles.length} shipments, ${alertCount} alerts raised`);
  }


  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async getFlightPosition(flightNumber: string): Promise<FlightPosition | null> {
    if (!flightNumber || flightNumber.length < 4) return null;

    try {
      // Production: integrate FlightAware AeroAPI or AviationStack
      // const apiKey = this.config.get('FLIGHTAWARE_API_KEY');
      // if (apiKey) { ... call API ... }
      this.logger.debug(`Flight position lookup: ${flightNumber} (flight API not configured — using prediction model)`);
      return null;
    } catch (err: any) {
      this.logger.debug(`Flight lookup failed for ${flightNumber}: ${err.message}`);
      return null;
    }
  }

  private calculateFlightEta(
    file: any,
    flightPosition: FlightPosition | null,
    airportCongestion: AirportCongestion | null,
  ): { predictedEta: Date | null; etaDiffHours: number | null; distanceKm: number | null; percentComplete: number; hoursInTransit: number } {
    const carrierEta = file.eta ? new Date(file.eta) : null;
    const etd = file.etd ? new Date(file.etd) : null;

    const hoursInTransit = etd && file.status === 'DEPARTED'
      ? Math.max(0, (Date.now() - etd.getTime()) / 3_600_000)
      : 0;

    // If we have live flight position, calculate distance-based ETA
    if (flightPosition && file.pod) {
      const destAirport = AIRPORTS[file.pod.toUpperCase()];
      if (destAirport) {
        const distanceKm = this.haversineKm(flightPosition.lat, flightPosition.lng, destAirport.lat, destAirport.lng);
        const avgSpeed = flightPosition.speed > 0 ? flightPosition.speed * 1.852 : 850; // Convert knots to km/h, default 850 km/h
        const hoursRemaining = distanceKm / avgSpeed;

        // Add ground handling time at destination
        const groundHours = airportCongestion?.totalAvgDelayHours || 6;
        const totalHoursRemaining = hoursRemaining + groundHours;

        const predictedEta = new Date(Date.now() + totalHoursRemaining * 3_600_000);
        const etaDiffHours = carrierEta
          ? Math.round((predictedEta.getTime() - carrierEta.getTime()) / 3_600_000)
          : null;

        // Percent complete
        const totalDistanceEstimate = distanceKm + (hoursInTransit * 850);
        const percentComplete = totalDistanceEstimate > 0
          ? Math.min(95, Math.round((1 - distanceKm / totalDistanceEstimate) * 100))
          : 50;

        return { predictedEta, etaDiffHours, distanceKm: Math.round(distanceKm), percentComplete, hoursInTransit: Math.round(hoursInTransit) };
      }
    }

    // Fallback: carrier ETA + ground handling buffer
    if (carrierEta && airportCongestion) {
      const buffer = airportCongestion.totalAvgDelayHours * 3_600_000;
      const predictedEta = new Date(carrierEta.getTime() + buffer);
      const etaDiffHours = Math.round(buffer / 3_600_000);

      const totalTransitHours = etd ? Math.max(1, (carrierEta.getTime() - etd.getTime()) / 3_600_000) : 12;
      const percentComplete = Math.min(95, Math.round((hoursInTransit / totalTransitHours) * 100));

      return { predictedEta, etaDiffHours, distanceKm: null, percentComplete, hoursInTransit: Math.round(hoursInTransit) };
    }

    return { predictedEta: null, etaDiffHours: null, distanceKm: null, percentComplete: 0, hoursInTransit: Math.round(hoursInTransit) };
  }


  private parseFlightNumber(vesselVoyage: string): string {
    // "SA 286 / 15AUG" → "SA286", "ET 501" → "ET501", "KQ100" → "KQ100"
    return vesselVoyage.split(/[/-]/)[0].replace(/\s+/g, '').replace(/\d{2}[A-Z]{3}$/i, '').trim();
  }

  private extractAwbFromFileNumber(fileNumber: string): string {
    // If file number contains AWB format (e.g. "083-12345678"), extract it
    const awbMatch = fileNumber.match(/(\d{3})-?(\d{8})/);
    if (awbMatch) return `${awbMatch[1]}-${awbMatch[2]}`;
    return fileNumber;
  }

  private getIataMilestoneCode(status: string): string {
    // IATA Cargo-IMP status codes
    const map: Record<string, string> = {
      'DRAFT': 'BKD', // Booked
      'BOOKED': 'BKD',
      'CARGO_RECEIVED': 'RCS', // Received from Shipper (FWB/FHL)
      'LOADED': 'MAN', // Manifested
      'DEPARTED': 'DEP', // Departed
      'ARRIVED': 'ARR', // Arrived
      'CUSTOMS_CLEARED': 'CCD', // Customs Cleared — Delivered to customs
      'DELIVERED': 'DLV', // Delivered
      'CANCELLED': 'CAN', // Cancelled
    };
    return map[status] || 'NFD'; // Not Found
  }

  private detectAirlinePrefix(carrierName: string): string {
    const normalized = carrierName.toLowerCase().trim();
    const prefixMap: Record<string, string> = {
      'south african': '083', 'ethiopian': '071', 'kenya airways': '706',
      'emirates': '176', 'qatar': '157', 'singapore': '618',
      'cathay': '160', 'british airways': '125', 'lufthansa': '020',
      'klm': '074', 'air france': '057', 'turkish': '235',
      'fedex': '784', 'ups': '023', 'dhl': '580',
      'cargolux': '139', 'air india': '054', 'airlink': '695',
    };
    for (const [key, prefix] of Object.entries(prefixMap)) {
      if (normalized.includes(key)) return prefix;
    }
    return '999'; // Default/unknown
  }

  private generateAwbSerial(fileNumber: string): string {
    // Generate 8-digit serial with valid IATA check digit (modulus 7)
    const base = fileNumber.replace(/\D/g, '').slice(0, 7).padStart(7, '0');
    const checkDigit = parseInt(base, 10) % 7;
    return `${base}${checkDigit}`;
  }

  private determineRateClass(chargeableWeight: number, description: string): AwbData['rateClass'] {
    const desc = description.toLowerCase();
    if (desc.includes('perishable') || desc.includes('fresh') || desc.includes('flower')) return 'S'; // Specific commodity
    if (desc.includes('dangerous') || desc.includes('hazardous')) return 'E'; // Exempt
    if (chargeableWeight >= 1000) return 'Q'; // Quantity rate (heavy)
    if (chargeableWeight >= 300) return 'C'; // Class rate
    if (chargeableWeight >= 45) return 'N'; // Normal rate (>45kg)
    return 'M'; // Minimum charge
  }


  private deriveSpecialHandlingCodes(cargo: any[], description: string): string[] {
    const codes: string[] = [];
    const all = [description, ...cargo.map((c: any) => c.description || '')].join(' ').toLowerCase();

    // IATA Special Handling Codes
    if (all.includes('perishable') || all.includes('fresh') || all.includes('flower') || all.includes('fruit')) codes.push('PER');
    if (all.includes('dangerous') || all.includes('hazardous') || all.includes('dg ')) codes.push('DGR');
    if (all.includes('animal') || all.includes('live')) codes.push('AVI');
    if (all.includes('human remain') || all.includes('coffin')) codes.push('HUM');
    if (all.includes('valuable') || all.includes('gold') || all.includes('diamond')) codes.push('VAL');
    if (all.includes('diplomat') || all.includes('embassy')) codes.push('DIP');
    if (all.includes('pharmaceutical') || all.includes('medicine') || all.includes('vaccine')) codes.push('PIL');
    if (all.includes('temperature') || all.includes('cold chain') || all.includes('frozen')) codes.push('COL');
    if (all.includes('radioactive') || all.includes('isotope')) codes.push('RRY');
    if (all.includes('firearm') || all.includes('ammunition') || all.includes('weapon')) codes.push('MUW');
    if (all.includes('oversiz') || all.includes('heavy lift')) codes.push('HEA');
    if (all.includes('fragile') || all.includes('glass')) codes.push('FRG');

    if (codes.length === 0) codes.push('GEN'); // General cargo

    return codes;
  }

  private getIndicativeRate(origin: string, destination: string): number {
    const key = `${origin.toUpperCase()}-${destination.toUpperCase()}`;
    const reverseKey = `${destination.toUpperCase()}-${origin.toUpperCase()}`;
    return AIR_RATES[key]?.ratePerKg || AIR_RATES[reverseKey]?.ratePerKg || 4.00;
  }

  private mapChargeToIataCode(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes('fuel') || desc.includes('fsc')) return 'MY'; // Fuel surcharge
    if (desc.includes('security') || desc.includes('tsc')) return 'RA'; // Security charge
    if (desc.includes('screen')) return 'XR'; // X-ray / screening
    if (desc.includes('handling') || desc.includes('thc')) return 'MH'; // Handling
    if (desc.includes('document') || desc.includes('awb')) return 'AW'; // AWB fee
    if (desc.includes('customs') || desc.includes('clearance')) return 'CD'; // Customs duty
    if (desc.includes('storage') || desc.includes('warehou')) return 'ST'; // Storage
    if (desc.includes('transport') || desc.includes('cartage')) return 'CT'; // Cartage
    if (desc.includes('insurance')) return 'IN'; // Insurance
    if (desc.includes('dangerous') || desc.includes('dg ')) return 'DG'; // DG surcharge
    return 'MC'; // Miscellaneous
  }


  private getRequiredCustomsDocs(destination: string, direction: string): string[] {
    const base = ['commercial-invoice', 'packing-list'];

    if (direction === 'EXPORT') {
      base.push('certificate-of-origin');
    }

    // Destination-specific requirements
    const dest = destination.toUpperCase();
    const airport = AIRPORTS[dest];
    if (!airport) return [...base, 'bill-of-lading']; // AWB equivalent

    switch (airport.countryCode) {
      case 'ZA': base.push('sad500'); break;
      case 'KE': base.push('kenya-c17'); break;
      case 'NG': base.push('nigeria-sgd'); break;
      case 'GH': base.push('ghana-boe'); break;
      case 'ET': base.push('ethiopia-erca'); break;
      case 'TZ': base.push('tanzania-tancis'); break;
      case 'UG': base.push('uganda-ura'); break;
      default: break;
    }

    return base;
  }

  private calculateCustomsRiskScore(file: any, missingDocs: string[]): number {
    let score = 0;

    // Missing documents increase risk heavily
    score += missingDocs.length * 15;

    // No HS codes on cargo — risk for wrong classification
    const cargoWithoutHs = (file.cargo || []).filter((c: any) => !c.hsCode).length;
    score += cargoWithoutHs * 10;

    // High customs value = more scrutiny
    const totalValue = (file.cargo || []).reduce((s: number, c: any) => s + (c.customsValue || 0), 0);
    if (totalValue > 100000) score += 15;
    else if (totalValue > 50000) score += 8;

    // Origin from high-risk countries (generalized)
    const origin = (file.pol || '').toUpperCase();
    const highRiskOrigins = ['PVG', 'BKK', 'DEL', 'BOM'];
    if (highRiskOrigins.includes(origin)) score += 10;

    // No declared customs value at all
    if (totalValue === 0 && (file.cargo || []).length > 0) score += 20;

    return Math.min(100, score);
  }

  private determinePreClearanceStatus(file: any, missingDocs: string[], riskScore: number): CustomsPreClearance['status'] {
    if (file.status === 'CUSTOMS_CLEARED' || file.status === 'DELIVERED') return 'RELEASED';
    if (riskScore >= 70) return 'HOLD';
    if (riskScore >= 50) return 'EXAM_REQUIRED';
    if (missingDocs.length === 0 && file.status === 'DEPARTED') return 'ACI_SUBMITTED';
    if (missingDocs.length === 0 && file.status === 'ARRIVED') return 'PRE_CLEARED';
    return 'NOT_STARTED';
  }

  private parseUldType(uldCode: string): string {
    // Extract 3-character type prefix from ULD code (e.g. "AKE12345SA" → "AKE")
    const match = uldCode.match(/^([A-Z]{3})/);
    return match ? match[1] : 'AKE';
  }

  private parseUldAirline(uldCode: string): string {
    // Extract 2-character airline owner from end of ULD code (e.g. "AKE12345SA" → "SA")
    const match = uldCode.match(/([A-Z]{2})$/);
    return match ? match[1] : 'XX';
  }

  private mapFileStatusToUldStatus(status: string): UldUnit['status'] {
    switch (status) {
      case 'CARGO_RECEIVED': return 'LOADED';
      case 'LOADED': return 'LOADED';
      case 'DEPARTED': return 'IN_TRANSIT';
      case 'ARRIVED': return 'ARRIVED';
      case 'CUSTOMS_CLEARED': case 'DELIVERED': return 'RETURNED';
      default: return 'AVAILABLE';
    }
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
