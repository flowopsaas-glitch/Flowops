import { api } from "./client";

/** The API wraps every payload as { data, statusCode, message }; tolerate an already-unwrapped value too. */
const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

// ── Telemetry (Phase 3) — devices, positions, alerts ────────────────────────

export type RailDeviceKind = "WAGON_TRACKER" | "LOCO_TELEMATICS" | "WAYBILL_SCANNER" | "PORT_SCANNER";
export type RailDeviceStatus = "ACTIVE" | "INACTIVE" | "FAULTY";
export type RailAlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type RailAlertKind = "SPEED_EXCEEDED" | "BATTERY_LOW" | "DEVICE_SILENT" | "TEMPERATURE";

export interface RailDevice {
  id: string;
  deviceCode: string;
  kind: RailDeviceKind;
  status: RailDeviceStatus;
  label: string | null;
  wagonNumber: string | null;
  locoReference: string | null;
  simRef: string | null;
  speedLimitKph: number | null;
  batteryThresholdPct: number | null;
  notes: string | null;
  tokenPrefix: string;
  lastSeenAt: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastSpeedKph: number | null;
  lastBatteryPct: number | null;
  silent: boolean;
  openAlerts: number;
  createdAt: string;
}

export interface TelemetryPoint {
  id: string;
  recordedAt: string;
  lat: number;
  lng: number;
  speedKph: number | null;
  headingDeg: number | null;
  batteryPct: number | null;
  temperatureC: number | null;
  doorOpen: boolean | null;
}

export interface TelemetrySummary {
  deviceId: string;
  deviceCode: string;
  sinceHours: number;
  pointCount: number;
  distanceKm: number;
  maxSpeedKph: number | null;
  avgSpeedKph: number | null;
  lastSeenAt: string | null;
  silent: boolean;
}

export interface TelemetryAlert {
  id: string;
  deviceId: string;
  kind: RailAlertKind;
  status: RailAlertStatus;
  message: string;
  value: number | null;
  threshold: number | null;
  raisedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  device?: { deviceCode: string; label: string | null; wagonNumber: string | null };
}

export const listRailDevices = async (): Promise<RailDevice[]> => {
  const r = unwrap(await api.get("/rail/telemetry/devices"));
  return Array.isArray(r) ? r : [];
};

export const createRailDevice = async (dto: {
  deviceCode: string; kind?: RailDeviceKind; label?: string; wagonNumber?: string;
  locoReference?: string; simRef?: string; speedLimitKph?: number; batteryThresholdPct?: number; notes?: string;
}): Promise<{ device: RailDevice; ingestToken: string }> => unwrap(await api.post("/rail/telemetry/devices", dto));

export const updateRailDevice = async (id: string, dto: {
  status?: RailDeviceStatus; label?: string; wagonNumber?: string; locoReference?: string;
  simRef?: string; speedLimitKph?: number; batteryThresholdPct?: number; notes?: string;
}): Promise<RailDevice> => unwrap(await api.patch(`/rail/telemetry/devices/${id}`, dto));

export const rotateDeviceToken = async (id: string): Promise<{ device: RailDevice; ingestToken: string }> =>
  unwrap(await api.post(`/rail/telemetry/devices/${id}/rotate-token`, {}));

export const getDevicePoints = async (id: string, opts: { from?: string; to?: string; limit?: number } = {}): Promise<TelemetryPoint[]> => {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.limit) params.set("limit", String(opts.limit));
  const r = unwrap(await api.get(`/rail/telemetry/devices/${id}/points${params.size ? `?${params}` : ""}`));
  return Array.isArray(r) ? r : [];
};

export const getDeviceSummary = async (id: string, sinceHours = 24): Promise<TelemetrySummary> =>
  unwrap(await api.get(`/rail/telemetry/devices/${id}/summary?sinceHours=${sinceHours}`));

export const listTelemetryAlerts = async (q: { status?: RailAlertStatus; deviceId?: string } = {}): Promise<TelemetryAlert[]> => {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.deviceId) params.set("deviceId", q.deviceId);
  const r = unwrap(await api.get(`/rail/telemetry/alerts${params.size ? `?${params}` : ""}`));
  return Array.isArray(r) ? r : [];
};

export const acknowledgeAlert = async (id: string, note?: string): Promise<TelemetryAlert> =>
  unwrap(await api.post(`/rail/telemetry/alerts/${id}/acknowledge`, { note }));

export const resolveAlert = async (id: string, note?: string): Promise<TelemetryAlert> =>
  unwrap(await api.post(`/rail/telemetry/alerts/${id}/resolve`, { note }));

export const DEVICE_KIND_LABEL: Record<RailDeviceKind, string> = {
  WAGON_TRACKER: "Wagon tracker", LOCO_TELEMATICS: "Loco telematics",
  WAYBILL_SCANNER: "Waybill scanner", PORT_SCANNER: "Port scanner",
};

export const ALERT_KIND_LABEL: Record<RailAlertKind, string> = {
  SPEED_EXCEEDED: "Speed exceeded", BATTERY_LOW: "Battery low",
  DEVICE_SILENT: "Device silent", TEMPERATURE: "Temperature",
};
