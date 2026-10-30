import { api, getToken, getApiBaseUrl } from "./client";

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

export type FreightMode = "OCEAN" | "AIR" | "ROAD";
export type FreightDirection = "IMPORT" | "EXPORT";
export type LoadType = "FCL" | "LCL" | "BREAKBULK" | "AIR";
export type ShipmentStatus =
  | "DRAFT" | "BOOKED" | "CARGO_RECEIVED" | "LOADED" | "DEPARTED"
  | "ARRIVED" | "CUSTOMS_CLEARED" | "DELIVERED" | "CANCELLED";

export interface Container { id: string; containerNo: string; isoType: string; sealNo?: string | null; vgmKg?: number | null; freeDays?: number | null; perDiemRate?: number | null; availableFrom?: string | null; returnedAt?: string | null; }
export interface Cargo { id: string; description: string; pieces?: number | null; weightKg?: number | null; dimensions?: string | null; hsCode?: string | null; customsValue?: number | null; dutyRatePct?: number | null; unNumber?: string | null; dgClass?: string | null; packingGroup?: string | null; emergencyPhone?: string | null; }
export interface Charge { id: string; description: string; currency: string; cost: number; sell: number; invoiceTo?: string | null; }
export interface ShipDoc { id: string; type: string; fileName: string; fileKey: string; createdAt: string; }
export interface Milestone { id: string; status: ShipmentStatus; note?: string | null; reachedAt: string; }

export interface ShipmentFile {
  id: string;
  fileNumber: string;
  mode: FreightMode;
  direction: FreightDirection;
  loadType: LoadType;
  status: ShipmentStatus;
  incoterm?: string | null;
  shipperName?: string | null;
  consigneeName?: string | null;
  notifyParty?: string | null;
  carrierName?: string | null;
  agentName?: string | null;
  goodsDescription?: string | null;
  packages?: number | null;
  grossWeightKg?: number | null;
  volumeCbm?: number | null;
  pol?: string | null;
  pod?: string | null;
  vesselVoyage?: string | null;
  shipperAddress?: string | null;
  consigneeAddress?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
  transitCountries?: string | null;
  vehicleReg?: string | null;
  sealNumbers?: string | null;
  importerTin?: string | null;
  vesselMmsi?: string | null;
  vesselImo?: string | null;
  etd?: string | null;
  eta?: string | null;
  aiRiskScore?: number | null;
  aiRiskNote?: string | null;
  isMaster?: boolean;
  masterFileId?: string | null;
  createdAt: string;
  containers?: Container[];
  cargo?: Cargo[];
  charges?: Charge[];
  documents?: ShipDoc[];
  milestones?: Milestone[];
  _count?: { containers: number; cargo: number; charges: number; documents: number };
}

export interface Totals {
  currencies: { currency: string; cost: number; sell: number; margin: number; marginPct: number }[];
  chargeCount: number;
}

export interface HsSuggestion { hsCode: string; description: string; confidence: number; }

export const listFiles = async (f: { mode?: string; direction?: string; status?: string; q?: string } = {}): Promise<ShipmentFile[]> => {
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const r = unwrap(await api.get(`/forwarding/files${qs ? `?${qs}` : ""}`));
  return Array.isArray(r) ? r : [];
};
export const getFile = async (id: string): Promise<ShipmentFile> => unwrap(await api.get(`/forwarding/files/${id}`));
export const createFile = async (dto: Partial<ShipmentFile>): Promise<ShipmentFile> => unwrap(await api.post(`/forwarding/files`, dto));
export const updateFile = async (id: string, dto: Partial<ShipmentFile>): Promise<ShipmentFile> => unwrap(await api.patch(`/forwarding/files/${id}`, dto));
export const cancelFile = async (id: string) => unwrap(await api.delete(`/forwarding/files/${id}`));
export const advanceMilestone = async (id: string, status: string, note?: string) => unwrap(await api.post(`/forwarding/files/${id}/milestone`, { status, note }));

export const addContainer = async (id: string, dto: Partial<Container>): Promise<Container & { wellFormed?: boolean; checkDigitValid?: boolean }> => unwrap(await api.post(`/forwarding/files/${id}/containers`, dto));
export const removeContainer = async (id: string, cid: string) => unwrap(await api.delete(`/forwarding/files/${id}/containers/${cid}`));
export const addCargo = async (id: string, dto: Partial<Cargo>) => unwrap(await api.post(`/forwarding/files/${id}/cargo`, dto));
export const removeCargo = async (id: string, cid: string) => unwrap(await api.delete(`/forwarding/files/${id}/cargo/${cid}`));

export const addCharge = async (id: string, dto: Partial<Charge>) => unwrap(await api.post(`/forwarding/files/${id}/charges`, dto));
export const removeCharge = async (id: string, cid: string) => unwrap(await api.delete(`/forwarding/files/${id}/charges/${cid}`));
export const getTotals = async (id: string): Promise<Totals> => unwrap(await api.get(`/forwarding/files/${id}/totals`));
export const generateInvoice = async (id: string) => unwrap(await api.post(`/forwarding/files/${id}/invoice`, {}));

export const addDocument = async (id: string, dto: { type: string; fileName: string; fileKey: string }) => unwrap(await api.post(`/forwarding/files/${id}/documents`, dto));
export const removeDocument = async (id: string, did: string) => unwrap(await api.delete(`/forwarding/files/${id}/documents/${did}`));

export const createDelivery = async (id: string): Promise<{ collectionId?: string }> => unwrap(await api.post(`/forwarding/files/${id}/create-delivery`, {}));
export const hsClassify = async (id: string, description: string): Promise<{ available: boolean; suggestions: HsSuggestion[] }> =>
  unwrap(await api.post(`/forwarding/files/${id}/ai/hs-classify`, { description }));
export const assessRisk = async (id: string): Promise<{ riskScore: number; riskNote: string }> =>
  unwrap(await api.post(`/forwarding/files/${id}/ai/risk`, {}));

// ── Phase 2: customs + documents ──────────────────────────────────────────

export interface CustomsEstimateLine {
  cargoId: string; description: string; hsCode?: string | null;
  customsValue: number; dutyRatePct: number; duty: number; atv: number; vat: number; totalPayable: number;
}
export interface CustomsEstimate {
  currency: string; vatRatePct: number; upliftmentPct: number;
  lines: CustomsEstimateLine[];
  totals: { customsValue: number; duty: number; vat: number; totalPayable: number };
  note: string;
}

export const getCustomsEstimate = async (id: string): Promise<CustomsEstimate> =>
  unwrap(await api.get(`/forwarding/files/${id}/customs-estimate`));
export const suggestDuty = async (id: string, hsCode?: string, description?: string): Promise<{ available: boolean; dutyRatePct?: number; note?: string }> =>
  unwrap(await api.post(`/forwarding/files/${id}/ai/duty-suggest`, { hsCode, description }));
export const updateCargo = async (id: string, cid: string, dto: Partial<Cargo>) =>
  unwrap(await api.patch(`/forwarding/files/${id}/cargo/${cid}`, dto));

export type ForwardingDocType =
  | "commercial-invoice" | "packing-list" | "bill-of-lading" | "sad500"
  | "cmr" | "certificate-of-origin" | "dangerous-goods" | "transit-bond"
  | "zim-form47" | "kenya-c17" | "nigeria-sgd" | "ghana-boe"
  | "ethiopia-erca" | "tanzania-tancis" | "drc-dgda" | "egypt-nafeza"
  | "mozambique-jue" | "botswana-burs" | "uganda-ura" | "rwanda-rra"
  | "ivory-coast-dgd" | "senegal-gainde" | "cameroon-sydonia"
  | "comesa-cd" | "ecowas-sgd" | "eac-cd" | "sadc-cd";

// ── Phase 3: SAD declaration + demurrage ──────────────────────────────────

export type DeclarationStatus = "DRAFT" | "SUBMITTED" | "QUERY" | "RELEASED" | "REJECTED";
export interface CustomsDeclaration {
  id: string; status: DeclarationStatus; type: string;
  lrn?: string | null; mrn?: string | null;
  customsValueTotal?: number | null; dutyTotal?: number | null; vatTotal?: number | null;
  submittedAt?: string | null; responseNote?: string | null; payload?: unknown;
  lodgementProvider?: string | null;
}

export const getDeclaration = async (id: string): Promise<CustomsDeclaration | null> => unwrap(await api.get(`/forwarding/files/${id}/declaration`));
export const buildDeclaration = async (id: string): Promise<CustomsDeclaration> => unwrap(await api.post(`/forwarding/files/${id}/declaration`, {}));
export const submitDeclaration = async (did: string): Promise<CustomsDeclaration> => unwrap(await api.post(`/forwarding/declarations/${did}/submit`, {}));
export const setDeclarationStatus = async (did: string, status: string, mrn?: string, note?: string): Promise<CustomsDeclaration> =>
  unwrap(await api.patch(`/forwarding/declarations/${did}/status`, { status, mrn, note }));

// ── SARS EDI transmission credentials (per-tenant, BYO) ────────────────────

export type CustomsEdiPath = "DIRECT_EDI" | "SERVICE_PROVIDER" | "CLEARING_AGENT_HANDOFF";
export interface CustomsEdiCredential {
  path: CustomsEdiPath;
  status: "UNVERIFIED" | "VERIFIED" | "DISABLED";
  customsClientCode?: string | null;
  providerName?: string | null;
  endpointUrl?: string | null;
  agentEmail?: string | null;
  hasSecret: boolean;
  secretMasked?: string | null;
  lastVerifiedAt?: string | null;
  updatedAt?: string | null;
}
export interface UpsertEdiCredential {
  path: CustomsEdiPath;
  customsClientCode?: string;
  providerName?: string;
  endpointUrl?: string;
  agentEmail?: string;
  secret?: string;
}
export interface CustomsEdiMessage {
  id: string; direction: "OUTBOUND" | "INBOUND"; messageType: string;
  status: string; reference?: string | null; error?: string | null; createdAt: string;
}

export const getEdiCredential = async (): Promise<CustomsEdiCredential | null> =>
  unwrap(await api.get(`/forwarding/customs/edi/credential`));
export const upsertEdiCredential = async (dto: UpsertEdiCredential): Promise<CustomsEdiCredential> =>
  unwrap(await api.put(`/forwarding/customs/edi/credential`, dto));
export const verifyEdi = async (): Promise<{ ok: boolean; reason?: string | null }> =>
  unwrap(await api.post(`/forwarding/customs/edi/verify`, {}));
export const getDeclarationMessages = async (did: string): Promise<CustomsEdiMessage[]> => {
  const r = unwrap(await api.get(`/forwarding/declarations/${did}/messages`));
  return Array.isArray(r) ? r : [];
};

export interface DemurrageLine {
  containerId: string; containerNo: string; freeDays?: number; perDiemRate?: number;
  daysUsed: number; chargeableDays: number; charge: number; daysToFree?: number; open: boolean;
}
export interface Demurrage {
  lines: DemurrageLine[]; totalCharge: number; accruing: boolean; nearLimit: boolean;
  riskLevel: "low" | "medium" | "high";
}
export const getDemurrage = async (id: string): Promise<Demurrage> => unwrap(await api.get(`/forwarding/files/${id}/demurrage`));
export const setDemurrage = async (id: string, cid: string, dto: { freeDays?: number; perDiemRate?: number; availableFrom?: string | null; returnedAt?: string | null }) =>
  unwrap(await api.patch(`/forwarding/files/${id}/containers/${cid}/demurrage`, dto));

// ── Consolidation / co-load ───────────────────────────────────────────────

export interface AttachableHouse { id: string; fileNumber: string; direction: string; mode: string; consigneeName?: string | null; pod?: string | null; }
export interface ConsolidationView {
  master: ShipmentFile;
  houses: (ShipmentFile & { _count?: { containers: number; cargo: number } })[];
  summary: { houseCount: number; packages: number; grossWeightKg: number; volumeCbm: number };
}
export const markMaster = async (id: string): Promise<ShipmentFile> => unwrap(await api.post(`/forwarding/files/${id}/mark-master`, {}));
export const getConsolidation = async (id: string): Promise<ConsolidationView> => unwrap(await api.get(`/forwarding/files/${id}/consolidation`));
export const attachableHouses = async (id: string): Promise<AttachableHouse[]> => {
  const r = unwrap(await api.get(`/forwarding/files/${id}/attachable-houses`));
  return Array.isArray(r) ? r : [];
};
export const attachHouse = async (id: string, houseId: string): Promise<ConsolidationView> => unwrap(await api.post(`/forwarding/files/${id}/houses`, { houseId }));
export const detachHouse = async (id: string, houseId: string): Promise<ConsolidationView> => unwrap(await api.delete(`/forwarding/files/${id}/houses/${houseId}`));

/** Fetch a generated PDF (auth header) and open it in a new tab. */
export async function downloadDoc(id: string, type: ForwardingDocType): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/forwarding/files/${id}/documents/${type}.pdf`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Could not generate document");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}


// ── Command-centre overview ────────────────────────────────────────────────

export type ForwardingExceptionKind =
  | "RISK" | "DEMURRAGE" | "CUSTOMS_QUERY" | "CUSTOMS_REJECTED" | "DOCS";

export interface ForwardingException {
  fileId: string;
  fileNumber: string;
  kind: ForwardingExceptionKind;
  label: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

export interface ForwardingArrival {
  id: string;
  fileNumber: string;
  direction: FreightDirection;
  mode: FreightMode;
  status: ShipmentStatus;
  eta?: string | null;
  consigneeName?: string | null;
  pol?: string | null;
  pod?: string | null;
  vesselVoyage?: string | null;
  aiRiskScore: number;
  overdue: boolean;
}

export interface ForwardingOverview {
  kpis: {
    openFiles: number;
    totalFiles: number;
    arriving7d: number;
    atRisk: number;
    customsPending: number;
    demurrageExposure: number;
    demurrageAccruingCount: number;
    disbursementOutstanding: number;
    exceptions: number;
  };
  arrivals: ForwardingArrival[];
  customsQueue: { DRAFT: number; SUBMITTED: number; QUERY: number; RELEASED: number; REJECTED: number };
  exceptions: ForwardingException[];
  note: string;
}

export const getForwardingOverview = async (): Promise<ForwardingOverview> =>
  unwrap(await api.get(`/forwarding/overview`));

// ── Live vessel tracking (AISStream) ───────────────────────────────────────

export interface VesselPosition {
  vesselName: string;
  mmsi?: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  lastUpdated: string;
  ageMinutes: number;
  isStale: boolean;
  source: string;
}
export type VesselTrackingQuality = "LIVE" | "STALE" | "NO_MMSI" | "AWAITING" | "FEED_OFF";
export interface VesselTracking {
  fileId: string;
  fileNumber: string;
  vesselVoyage: string;
  pol: string;
  pod: string;
  carrierEta: string | null;
  predictedEta: string | null;
  etaDifferenceDays: number | null;
  vesselPosition: VesselPosition | null;
  portCongestion: { portName: string; country: string; avgWaitDays: number; congestionLevel: string } | null;
  distanceRemainingNm: number | null;
  percentComplete: number;
  daysAtSea: number;
  status: string;
  alerts: string[];
  trackingQuality: VesselTrackingQuality;
}
export const trackVessel = async (id: string): Promise<VesselTracking> =>
  unwrap(await api.get(`/forwarding/files/${id}/vessel-tracking`));

// ── SADC corridor reference data ───────────────────────────────────────────
//
// These figures are hand-compiled constants on the server, not measurements:
// typical wait hours, transit days, cost estimates and reference congestion
// bands. Nothing observes a border gate. Every response carries `provenance`
// saying so, and the UI prints that rather than a label of its own.

/** What the server says about the numbers it just sent. */
export interface ReferenceProvenance {
  source: "STATIC_REFERENCE";
  observed: false;
  measuredByFlowOps: false;
  /** Null when nobody has recorded a review date - never invented. */
  compiledAsOf: string | null;
  /** The sentence to show next to the figures. */
  basis: string;
}

export interface BorderPost {
  code: string;
  name: string;
  countries: [string, string];
  lat: number;
  lng: number;
  avgWaitHours: number;
  peakWaitHours: number;
  operatingHours: string;
  is24Hour: boolean;
  requiredDocs: string[];
  /** Typical band for this post, not conditions today. */
  congestionLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  notes: string;
  provenance?: ReferenceProvenance;
}
export interface TradeCorridor {
  code: string;
  name: string;
  origin: string;
  destination: string;
  distanceKm: number;
  avgTransitDays: number;
  borderPosts: string[];
  countries: string[];
  fuelCostEstimate: number;
  tollCostEstimate: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  keyRisks: string[];
  alternativePort: string;
  provenance?: ReferenceProvenance;
}
export interface WalvisVsDurban {
  walvisBay: { transitDays: number; portWait: number; borderWait: number; totalDays: number; cost: number; risk: string };
  durban: { transitDays: number; portWait: number; borderWait: number; totalDays: number; cost: number; risk: string };
  recommendation: string;
  savingsDays: number;
  savingsCost: number;
  provenance?: ReferenceProvenance;
}

export const getBorderPosts = async (): Promise<BorderPost[]> => {
  const r = unwrap(await api.get(`/forwarding/sadc/border-posts`));
  return Array.isArray(r) ? r : [];
};
export const getCorridors = async (): Promise<TradeCorridor[]> => {
  const r = unwrap(await api.get(`/forwarding/sadc/corridors`));
  return Array.isArray(r) ? r : [];
};
export const walvisVsDurban = async (destination: string): Promise<WalvisVsDurban> =>
  unwrap(await api.get(`/forwarding/sadc/walvis-vs-durban?destination=${encodeURIComponent(destination)}`));
