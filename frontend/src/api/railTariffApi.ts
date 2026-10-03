import { api } from "./client";

/** The API wraps every payload as { data, statusCode, message }; tolerate an already-unwrapped value too. */
const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

// ── Enums (mirror the backend) ───────────────────────────────────────────────
export type RailPriceStatus = "NOT_PUBLISHED" | "TBD" | "PUBLISHED";
export type OverloadStatus = "WITHIN_LIMIT" | "OVERLOADED" | "UNVERIFIED";
export type TariffStatus = "PRICED" | "INCOMPLETE" | "BLOCKED";
export type TariffLineKind = "GTK_LOADED" | "GTK_EMPTY" | "TRACTION_ENERGY" | "ANCILLARY" | "OVERLOAD_PENALTY";
export type RailLimitSource = "CORRIDOR" | "MANUAL" | "NONE";

/** The brief's three constants. They are labelled unverified: no supplied document corroborates them. */
export interface TariffConstants {
  infrastructureEscalationPct: number; electricityEscalationPct: number; dieselBasePricePerLitreZar: number; source: string;
}

/** One charge. `amountZar` is null when the line could not be priced — that is NOT zero and NOT free. */
export interface TariffLine {
  kind: TariffLineKind; code?: string; description: string; quantity: number | null; unit: string;
  rate: number | null; rateUnit: string | null; amountZar: number | null; basis: string; evidence: string[];
}

export interface HoldDecision { held: boolean; wagons: { wagonNumber: string; excessTonnes: number }[]; totalExcessTonnes: number; reason: string | null }

export interface TariffResult {
  status: TariffStatus; corridorCode: string | null; financialYear: string; scheduleId: string | null; scheduleFinancialYear: string | null;
  escalationYears: number; grossTonnesLoaded: number | null; grossTonnesEmpty: number | null; gtkLoaded: number | null; gtkEmpty: number | null;
  lines: TariffLine[]; subtotalZar: number; currency: "ZAR";
  /** BLOCKED: why nothing could be priced. INCOMPLETE: the lines that have no rate. */
  blockers: string[]; warnings: string[]; hold: HoldDecision;
  weightSources: { wagonNumber: string; source: "WEIGHBRIDGE" | "NOMINAL" | "UNKNOWN"; grossTonnes: number | null; tareTonnes: number | null }[];
}

export interface TariffPreview {
  consignment: { id: string; consignmentNumber: string; corridor: string | null; clientName: string | null; wagons: number };
  corridor: { code: string; name: string } | null; financialYear: string; result: TariffResult; constants: TariffConstants;
}

export interface TariffStatusResponse {
  constants: TariffConstants;
  corridors: { code: string; name: string; years: { financialYear: string; hasLoadedRate: boolean; hasEmptyRate: boolean; dataStatus: string }[]; hasVerifiedLoadedRate: boolean }[];
  summary: { corridors: number; withVerifiedRate: number; ancillaryLines: number; ancillaryPublished: number; ancillaryTbd: number; ancillaryNotPublished: number };
  fromCatalogFallback: boolean; message: string;
}

/** One of the 113 Annexure 40 lines. The annexure publishes no price, so `unitRateZar` is null today. */
export interface AncillaryService {
  code: string; name: string; serviceName: string; unitOfMeasure: string; priceStatus: RailPriceStatus; unitRateZar: number | null;
  serviceNumber: number; tier: number; tierName: string; group: string; isCompulsory: boolean;
  description: string | null; section: string | null; sourceLabel: string | null; rateSourceRef: string | null; fromCatalog: boolean;
}

/** What the user supplies. Rates, consumption factors and the weights come from stored data on the server. */
export interface TariffRequest {
  consignmentId: string; distanceKm: number; financialYear?: string; includeEmptyReturn?: boolean; allowEscalation?: boolean;
  traction?: { type: "DIESEL" | "ELECTRIC"; litres?: number; kWh?: number; pricePerUnitZar?: number };
  ancillary?: { code: string; quantity: number }[];
}

export interface SavedCalculation {
  id: string; calculationNumber: string; consignmentId: string; consignmentNumber: string; corridorCode: string; financialYear: string;
  status: "PRICED" | "INCOMPLETE"; lines: TariffLine[]; blockers: string[]; warnings: string[];
  gtkLoaded: number | null; gtkEmpty: number | null; subtotalZar: number; currency: string; holdTriggered: boolean;
  invoiceDraftId: string | null; invoiceDraftedAt: string | null; createdAt: string;
}

export interface InvoiceDraftResult { created: boolean; draft: { id: string; title?: string } | null }

// ── Tariffs ──────────────────────────────────────────────────────────────────
export const getTariffStatus = async (): Promise<TariffStatusResponse> => unwrap(await api.get("/rail/tariffs/status"));
export const getAncillaryServices = async (): Promise<AncillaryService[]> => {
  const r = unwrap<AncillaryService[]>(await api.get("/rail/tariffs/ancillary"));
  return Array.isArray(r) ? r : [];
};
export const previewTariff = async (dto: TariffRequest): Promise<TariffPreview> => unwrap(await api.post("/rail/tariffs/preview", dto));
export const calculateTariff = async (dto: TariffRequest): Promise<{ calculation: SavedCalculation } & TariffPreview> => unwrap(await api.post("/rail/tariffs/calculations", dto));
export const listCalculations = async (f: { consignmentId?: string } = {}): Promise<SavedCalculation[]> => {
  const qs = f.consignmentId ? `?consignmentId=${encodeURIComponent(f.consignmentId)}` : "";
  const r = unwrap<SavedCalculation[]>(await api.get(`/rail/tariffs/calculations${qs}`));
  return Array.isArray(r) ? r : [];
};
export const generateInvoiceDraft = async (id: string, dto: { clientName?: string } = {}): Promise<InvoiceDraftResult> =>
  unwrap(await api.post(`/rail/tariffs/calculations/${id}/invoice-draft`, dto));

// ── Weighbridge ──────────────────────────────────────────────────────────────
export interface WeighbridgeReading {
  id: string; consignmentId: string; wagonId?: string | null; wagonNumber: string; weighbridge?: string | null; weighedAt: string; actualTonnes: number;
  axles?: number | null; maxAxleLoadTonnes?: number | null; limitSource: RailLimitSource; corridorCode?: string | null;
  allowedTonnes?: number | null; excessTonnes?: number | null; status: OverloadStatus; note?: string | null; createdAt: string;
}

export interface WeighbridgeDraft {
  consignmentId: string; wagonNumber: string; actualTonnes: number; axles?: number; maxAxleLoadTonnes?: number; weighbridge?: string; weighedAt?: string; note?: string;
}

/** The SERVER's verdict on the reading and on the consignment's hold. */
export interface WeighbridgeResult {
  reading: WeighbridgeReading;
  evaluation: { status: OverloadStatus; allowedTonnes: number | null; excessTonnes: number | null; reason: string };
  hold: { held: boolean; status: "NONE" | "HOLD_FOR_LOAD_ADJUSTMENT"; reason: string | null; wagons: { wagonNumber: string; excessTonnes: number }[]; totalExcessTonnes: number; changed: boolean };
}

export const listWeighbridgeReadings = async (consignmentId: string): Promise<WeighbridgeReading[]> => {
  const r = unwrap<WeighbridgeReading[]>(await api.get(`/rail/weighbridge/readings?consignmentId=${encodeURIComponent(consignmentId)}`));
  return Array.isArray(r) ? r : [];
};
export const recordWeighbridgeReading = async (dto: WeighbridgeDraft): Promise<WeighbridgeResult> => unwrap(await api.post("/rail/weighbridge/readings", dto));
