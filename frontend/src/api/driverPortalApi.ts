import { api } from "./client";

/**
 * Driver Portal API — modes, duties (shifts), mode-scoped work, train board.
 * These endpoints authenticate with the DRIVER session token (phone + PIN),
 * never a tenant token. Mode configuration (labels, checklists, POD rules) is
 * SERVER-DRIVEN via GET /driver-portal/modes — the UI never invents policy.
 */

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

export type DriverMode = "BICYCLE" | "BAKKIE" | "TRUCK" | "LINEHAUL" | "TRAIN";
export type JobKind = "parcel" | "collection" | "linehaul" | "rail";

export interface DriveModeConfig {
  mode: DriverMode;
  label: string;
  jobKinds: JobKind[];
  requiresVehicleReg: boolean;
  pod: { signature: boolean; photo: boolean; scan: boolean };
  checklist: string[];
  description: string;
  allowed: boolean;
}

export interface DriverDuty {
  id: string;
  mode: DriverMode;
  status: "ACTIVE" | "COMPLETED";
  vehicleReg: string | null;
  note: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface ModesResponse {
  activeDuty: DriverDuty | null;
  defaultMode: DriverMode | null;
  vehicleReg: string | null;
  modes: DriveModeConfig[];
}

export interface WorkJob {
  id: string;
  type: string;
  status: string;
  trackingNumber: string;
  recipientName: string | null;
  recipientAddress: string | null;
  codAmount?: number | null;
  manifestId?: string | null;
  manifestCode?: string | null;
  parcelCount?: number | null;
  [k: string]: unknown;
}

export interface WorkResponse {
  duty: DriverDuty | null;
  mode: DriverMode | null;
  config: DriveModeConfig | null;
  jobs: WorkJob[];
}

export interface TrainBoardManifest {
  id: string;
  manifestNumber: string;
  revision: number;
  status: string;
  route: string;
  corridor: string | null;
  railOperator: string | null;
  locoReference: string | null;
  plannedDeparture: string | null;
  plannedArrival: string | null;
  wagons: number;
}

export interface TrainBoardPossession {
  id: string;
  title: string;
  kind: string;
  status: string;
  location: string | null;
  corridorCode: string;
  startsAt: string;
  endsAt: string;
}

export interface TrainBoardResponse {
  manifests: TrainBoardManifest[];
  possessions: TrainBoardPossession[];
}

export const getDriverModes = async (): Promise<ModesResponse> => unwrap(await api.get("/driver-portal/modes"));
export const getActiveDuty = async (): Promise<DriverDuty | null> => unwrap(await api.get("/driver-portal/duty/active"));
export const startDuty = async (dto: { mode: DriverMode; vehicleReg?: string; note?: string }): Promise<{ duty: DriverDuty; previousEnded: { id: string; mode: DriverMode; endedAt: string } | null; config: DriveModeConfig }> =>
  unwrap(await api.post("/driver-portal/duty/start", dto));
export const endDuty = async (note?: string): Promise<{ duty: DriverDuty; durationMinutes: number }> =>
  unwrap(await api.post("/driver-portal/duty/end", { note }));
export const getDriverWork = async (): Promise<WorkResponse> => unwrap(await api.get("/driver-portal/work"));
export const getTrainBoard = async (): Promise<TrainBoardResponse> => unwrap(await api.get("/driver-portal/train-board"));

/** FE-side icon key per mode (icons stay front-end; policy stays server-side). */
export const MODE_ICON: Record<DriverMode, string> = {
  BICYCLE: "bike", BAKKIE: "car", TRUCK: "truck", LINEHAUL: "linehaul", TRAIN: "train",
};

export const MODE_LABEL: Record<DriverMode, string> = {
  BICYCLE: "Bicycle", BAKKIE: "Bakkie", TRUCK: "Truck", LINEHAUL: "Linehaul", TRAIN: "Train driver",
};
