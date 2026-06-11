import { IsBooleanString, IsNumberString, IsOptional, IsString } from "class-validator";

export class LiveTrackingQueryDto {
  @IsOptional()
  @IsBooleanString()
  onlyOpen?: string; // "true" | "false"

  @IsOptional()
  @IsNumberString()
  limit?: string; // "50"

  @IsOptional()
  @IsString()
  q?: string; // search text
}

export type StuckBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TrackingRow = {
  dispatchId: number;
  status: string;
  updatedAt: string;
  createdAt: string;

  collection: null | {
    id: number;
    name: string;
    status: string;
    approvalStatus: string;
    createdAt: string;
  };

  driver: null | {
    id: number;
    name: string;
    zone: string | null;
    availabilityStatus: string;
    lastPingAt: string | null;
    phone: string | null;
  };

  signals: {
    stuckMinutes: number;
    isStuck: boolean;
    approvalsPending: boolean;
    uploadsCount: number;
    acksCount: number;
    hasInvoice: boolean;
    driverAssigned: boolean;
    driverLikelyOffline: boolean;
  };

  ai: {
    stuckScore: number; // 0-100
    band: StuckBand;
    summary: string;
    reasons: string[];
    actions: string[];
  };
};

export type LiveTrackingResponse = {
  summary: {
    total: number;
    open: number;
    stuck: number;
    critical: number;
    approvalsPending: number;
    unassigned: number;
    driversOffline: number;
  };
  items: TrackingRow[];
};