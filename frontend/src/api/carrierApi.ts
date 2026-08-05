import { api } from "./client";

const unwrap = (r: any) => r?.data ?? r;

export type CarrierType = "OCEAN_LINE" | "AIRLINE" | "ROAD_CARRIER" | "COURIER" | "CUSTOMS_BROKER" | "OTHER";

export interface CarrierRate {
  id: string;
  lane?: string | null;
  mode?: string | null;
  containerType?: string | null;
  buyRate: number;
  currency: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface Carrier {
  id: string;
  name: string;
  type: CarrierType;
  code?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  accountNumber?: string | null;
  notes?: string | null;
  isActive: boolean;
  rates?: CarrierRate[];
  createdAt?: string;
}

export interface CarrierMetrics { total: number; active: number; rates: number; }

export const listCarriers = async (q?: { type?: string; active?: string; q?: string }): Promise<Carrier[]> => {
  const r = unwrap(await api.get("/carriers", { params: q }));
  return Array.isArray(r) ? r : [];
};
export const carrierMetrics = async (): Promise<CarrierMetrics> => unwrap(await api.get("/carriers/metrics"));
export const createCarrier = async (dto: Partial<Carrier>): Promise<Carrier> => unwrap(await api.post("/carriers", dto));
export const updateCarrier = async (id: string, dto: Partial<Carrier>): Promise<Carrier> => unwrap(await api.patch(`/carriers/${id}`, dto));
export const deleteCarrier = async (id: string): Promise<{ deleted: boolean }> => unwrap(await api.delete(`/carriers/${id}`));
export const addCarrierRate = async (id: string, dto: Partial<CarrierRate>): Promise<CarrierRate> => unwrap(await api.post(`/carriers/${id}/rates`, dto));
export const deleteCarrierRate = async (id: string, rateId: string): Promise<{ deleted: boolean }> => unwrap(await api.delete(`/carriers/${id}/rates/${rateId}`));


// ── Lane Rate Explorer (buy-side benchmarking) ─────────────────────────────

export interface LaneQuote {
  carrierId: string;
  carrierName: string;
  buyRate: number;
  rateId: string;
  active: boolean;
}

export interface LaneAnalysisRow {
  lane: string;
  containerType?: string | null;
  mode?: string | null;
  currency: string;
  carrierCount: number;
  quoteCount: number;
  best: { carrierId: string; carrierName: string; buyRate: number; active: boolean };
  worstRate: number;
  avgRate: number;
  savings: number;
  savingsPct: number;
  quotes: LaneQuote[];
}

export interface LaneAnalysis {
  lanes: LaneAnalysisRow[];
  summary: {
    lanes: number;
    competitiveLanes: number;
    soleSourceLanes: number;
    totalSavings: Record<string, number>;
  };
  note: string;
}

export const laneAnalysis = async (): Promise<LaneAnalysis> => unwrap(await api.get("/carriers/lane-analysis"));
