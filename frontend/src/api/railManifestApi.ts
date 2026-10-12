import { api } from "./client";

/** The API wraps every payload as { data, statusCode, message }; tolerate an already-unwrapped value too. */
const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

// ── Digital Train Manifest — the departure document ──────────────────────────

export type TrainManifestStatus = "DRAFT" | "ISSUED" | "DEPARTED" | "ARRIVED" | "CLOSED" | "SUPERSEDED" | "CANCELLED";

export interface TrainManifestWagon {
  id: string;
  position: number;
  wagonNumber: string;
  type: string;
  tareTonnes: number | null;
  loadedTonnes: number | null;
  commodity: string | null;
  sealNumbers: string | null;
  axles: number | null;
  isDangerousGoods: boolean;
  unNumber: string | null;
  imdgClass: string | null;
  placardRef: string | null;
  emergencyContact24h: string | null;
  msdsDocumentUrl: string | null;
  note: string | null;
}

export interface TrainManifest {
  id: string;
  manifestNumber: string;
  revision: number;
  supersedesId: string | null;
  status: TrainManifestStatus;
  consignmentId: string;
  consignmentNumber: string;
  slotApplicationId: string | null;
  trainServiceRef: string | null;
  corridor: string | null;
  originSiding: string | null;
  destinationSiding: string | null;
  railOperator: string | null;
  locoReference: string | null;
  plannedDeparture: string | null;
  plannedArrival: string | null;
  notes: string | null;
  issuedAt: string | null;
  issuedBy: string | null;
  departedAt: string | null;
  departedBy: string | null;
  arrivedAt: string | null;
  arrivedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  wagons: TrainManifestWagon[];
  _count?: { wagons: number };
}

export const listTrainManifests = async (q: { status?: string; consignmentId?: string } = {}): Promise<TrainManifest[]> => {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.consignmentId) params.set("consignmentId", q.consignmentId);
  const r = unwrap(await api.get(`/rail/manifests${params.size ? `?${params}` : ""}`));
  return Array.isArray(r) ? r : [];
};

export const getTrainManifest = async (id: string): Promise<TrainManifest> =>
  unwrap(await api.get(`/rail/manifests/${id}`));

export const createTrainManifest = async (dto: {
  consignmentId: string; slotApplicationId?: string; trainServiceRef?: string; corridor?: string;
  originSiding?: string; destinationSiding?: string; railOperator?: string; locoReference?: string;
  plannedDeparture?: string; plannedArrival?: string; notes?: string;
}): Promise<TrainManifest> => unwrap(await api.post("/rail/manifests", dto));

export const updateTrainManifest = async (id: string, dto: {
  trainServiceRef?: string; corridor?: string; originSiding?: string; destinationSiding?: string;
  railOperator?: string; locoReference?: string; plannedDeparture?: string; plannedArrival?: string;
  notes?: string; wagons?: Array<Partial<TrainManifestWagon> & { position: number; wagonNumber: string }>;
}): Promise<TrainManifest> => unwrap(await api.patch(`/rail/manifests/${id}`, dto));

const post = async (id: string, action: string, body: unknown = {}) =>
  unwrap(await api.post(`/rail/manifests/${id}/${action}`, body));

export const issueTrainManifest = (id: string, issuedBy: string) => post(id, "issue", { issuedBy });
export const amendTrainManifest = (id: string, note?: string) => post(id, "amend", { note });
export const departTrainManifest = (id: string, signedBy?: string) => post(id, "depart", { signedBy });
export const arriveTrainManifest = (id: string, signedBy?: string) => post(id, "arrive", { signedBy });
export const closeTrainManifest = (id: string, signedBy?: string) => post(id, "close", { signedBy });
export const cancelTrainManifest = (id: string, reason: string) => post(id, "cancel", { reason });

export const MANIFEST_STATUS_LABEL: Record<TrainManifestStatus, string> = {
  DRAFT: "Draft", ISSUED: "Issued", DEPARTED: "Departed", ARRIVED: "Arrived",
  CLOSED: "Closed", SUPERSEDED: "Superseded", CANCELLED: "Cancelled",
};
