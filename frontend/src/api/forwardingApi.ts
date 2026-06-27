import { api, getToken, getApiBaseUrl } from "./client";

const unwrap = (r: any) => r?.data ?? r;

export type FreightMode = "OCEAN" | "AIR" | "ROAD";
export type FreightDirection = "IMPORT" | "EXPORT";
export type LoadType = "FCL" | "LCL" | "BREAKBULK" | "AIR";
export type ShipmentStatus =
  | "DRAFT" | "BOOKED" | "CARGO_RECEIVED" | "LOADED" | "DEPARTED"
  | "ARRIVED" | "CUSTOMS_CLEARED" | "DELIVERED" | "CANCELLED";

export interface Container { id: string; containerNo: string; isoType: string; sealNo?: string | null; vgmKg?: number | null; }
export interface Cargo { id: string; description: string; pieces?: number | null; weightKg?: number | null; dimensions?: string | null; hsCode?: string | null; customsValue?: number | null; dutyRatePct?: number | null; }
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
  etd?: string | null;
  eta?: string | null;
  aiRiskScore?: number | null;
  aiRiskNote?: string | null;
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

export const addContainer = async (id: string, dto: Partial<Container>) => unwrap(await api.post(`/forwarding/files/${id}/containers`, dto));
export const removeContainer = async (id: string, cid: string) => unwrap(await api.delete(`/forwarding/files/${id}/containers/${cid}`));
export const addCargo = async (id: string, dto: Partial<Cargo>) => unwrap(await api.post(`/forwarding/files/${id}/cargo`, dto));
export const removeCargo = async (id: string, cid: string) => unwrap(await api.delete(`/forwarding/files/${id}/cargo/${cid}`));

export const addCharge = async (id: string, dto: Partial<Charge>) => unwrap(await api.post(`/forwarding/files/${id}/charges`, dto));
export const removeCharge = async (id: string, cid: string) => unwrap(await api.delete(`/forwarding/files/${id}/charges/${cid}`));
export const getTotals = async (id: string): Promise<Totals> => unwrap(await api.get(`/forwarding/files/${id}/totals`));
export const generateInvoice = async (id: string) => unwrap(await api.post(`/forwarding/files/${id}/invoice`, {}));

export const addDocument = async (id: string, dto: { type: string; fileName: string; fileKey: string }) => unwrap(await api.post(`/forwarding/files/${id}/documents`, dto));
export const removeDocument = async (id: string, did: string) => unwrap(await api.delete(`/forwarding/files/${id}/documents/${did}`));

export const createDelivery = async (id: string) => unwrap(await api.post(`/forwarding/files/${id}/create-delivery`, {}));
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

export type ForwardingDocType = "commercial-invoice" | "packing-list" | "bill-of-lading" | "sad500";

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
