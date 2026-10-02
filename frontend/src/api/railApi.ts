import { api } from "./client";
import type { DgSummary } from "./railChangeApi";

const unwrap = (r: any) => r?.data ?? r;

export type RailStatus =
  | "PLANNED" | "WAGONS_ALLOCATED" | "LOADING" | "DEPARTED" | "IN_TRANSIT"
  | "AT_INTERCHANGE" | "ARRIVED" | "OFFLOADED" | "COMPLETED" | "CANCELLED";

export type WagonType =
  | "FLAT" | "GONDOLA" | "TANK" | "BOXCAR" | "HOPPER" | "CONTAINER_CAR";

export type LegMode = "ROAD" | "RAIL" | "PORT";
export type LegStatus = "PENDING" | "IN_PROGRESS" | "HANDED_OVER" | "COMPLETED" | "DELAYED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** The five dangerous-goods fields the dispatch gate requires (consignment and wagon). */
export interface DangerousGoodsFields {
  isDangerousGoods?: boolean;
  unNumber?: string | null; imdgClass?: string | null; placardRef?: string | null;
  emergencyContact24h?: string | null; msdsDocumentUrl?: string | null;
}

export interface Wagon extends DangerousGoodsFields {
  id: string; wagonNumber: string; type: WagonType;
  tareTonnes?: number | null; loadedTonnes?: number | null;
  /** Axle count (used to default the weighbridge limit check). */
  axles?: number | null;
  commodity?: string | null; sealNumbers?: string | null;
  lastKnownSiding?: string | null; loadedAt?: string | null; offloadedAt?: string | null;
}

export interface IntermodalLeg {
  id: string; sequence: number; mode: LegMode; status: LegStatus;
  fromLocation?: string | null; toLocation?: string | null; handler?: string | null;
  plannedStart?: string | null; plannedEnd?: string | null;
  actualStart?: string | null; actualEnd?: string | null;
  dwellHours?: number | null; note?: string | null;
}

export interface RailEvent {
  id: string; status: RailStatus; note?: string | null; location?: string | null; reachedAt: string;
}

/** Set by the SERVER when a wagon's latest weighbridge reading is overloaded; it blocks dispatch until re-weighed within its limit. */
export type RailHoldStatus = "NONE" | "HOLD_FOR_LOAD_ADJUSTMENT";

export interface RailConsignment extends DangerousGoodsFields {
  id: string;
  consignmentNumber: string;
  status: RailStatus;
  clientName?: string | null;
  commodity: string;
  tonnage?: number | null;
  wagonsPlanned?: number | null;
  corridor?: string | null;
  originSiding?: string | null;
  destinationSiding?: string | null;
  railOperator?: string | null;
  serviceRef?: string | null;
  interchangePoint?: string | null;
  plannedDeparture?: string | null;
  plannedArrival?: string | null;
  actualDeparture?: string | null;
  actualArrival?: string | null;
  slaHours?: number | null;
  riskLevel?: RiskLevel | null;
  riskNote?: string | null;
  createdAt: string;
  holdStatus?: RailHoldStatus;
  holdReason?: string | null;
  holdSetAt?: string | null;
  holdClearedAt?: string | null;
  wagons?: Wagon[];
  legs?: IntermodalLeg[];
  events?: RailEvent[];
  _count?: { wagons: number; legs: number; events: number };
  /** Dangerous-goods readiness — present on list rows (computed by the server). */
  dg?: DgSummary;
}

export interface RailOverview {
  generatedAt: string;
  metrics: {
    activeConsignments: number;
    inTransit: number;
    atInterchange: number;
    wagonsInTransit: number;
    totalWagons: number;
    tonnageMoved: number;
    tonnagePlanned: number;
    onTimePct: number | null;
    avgTransitHours: number | null;
    avgInterchangeDwellHours: number | null;
    atRisk: number;
  };
  byCorridor: { corridor: string; consignments: number; tonnage: number }[];
}

// ── Overview / KPIs ──────────────────────────────────────────────────────────
export const getRailOverview = async (): Promise<RailOverview> =>
  unwrap(await api.get(`/rail/overview`));

// ── Consignments ─────────────────────────────────────────────────────────────
export const listConsignments = async (
  f: { status?: string; corridor?: string; commodity?: string; q?: string } = {},
): Promise<RailConsignment[]> => {
  const qs = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as [string, string][],
  ).toString();
  const r = unwrap(await api.get(`/rail/consignments${qs ? `?${qs}` : ""}`));
  return Array.isArray(r) ? r : [];
};

export const getConsignment = async (id: string): Promise<RailConsignment> =>
  unwrap(await api.get(`/rail/consignments/${id}`));

export const createConsignment = async (dto: Partial<RailConsignment>): Promise<RailConsignment> =>
  unwrap(await api.post(`/rail/consignments`, dto));

export const updateConsignment = async (id: string, dto: Partial<RailConsignment>): Promise<RailConsignment> =>
  unwrap(await api.patch(`/rail/consignments/${id}`, dto));

export const advanceConsignment = async (id: string, status: string, note?: string, location?: string) =>
  unwrap(await api.post(`/rail/consignments/${id}/advance`, { status, note, location }));

export const cancelConsignment = async (id: string) =>
  unwrap(await api.delete(`/rail/consignments/${id}`));

// ── Wagons ───────────────────────────────────────────────────────────────────
export const addWagon = async (id: string, dto: Partial<Wagon>) =>
  unwrap(await api.post(`/rail/consignments/${id}/wagons`, dto));
export const removeWagon = async (id: string, wagonId: string) =>
  unwrap(await api.delete(`/rail/consignments/${id}/wagons/${wagonId}`));

// ── Intermodal legs ──────────────────────────────────────────────────────────
export const addLeg = async (id: string, dto: Partial<IntermodalLeg>) =>
  unwrap(await api.post(`/rail/consignments/${id}/legs`, dto));
export const advanceLeg = async (id: string, legId: string, status: string) =>
  unwrap(await api.post(`/rail/consignments/${id}/legs/${legId}/advance`, { status }));
