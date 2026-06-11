import { IsBooleanString, IsNumberString, IsOptional, IsString } from "class-validator";

export class OpsQueueQueryDto {
  @IsOptional()
  @IsBooleanString()
  onlyOpen?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

export type OpsQueueItem = {
  id: number;
  status: string;
  createdAt: string;
  updatedAt: string;

  assignedDriver?: { id: number; name: string } | null;

  collection?: {
    id: number;
    name: string;
    status: string;
    approvalStatus: string;
    createdAt: string;
  } | null;

  createdBy?: { id: number; email: string; role: string } | null;

  signals: {
    stuckMinutes: number;
    isStuck: boolean;
    approvalsPending: boolean;
    acksCount: number;
    uploadsCount: number;
    hasInvoice: boolean;
  };

  ai: {
    priorityScore: number;
    priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    summary: string;
    reasons: string[];
    actions: string[];
  };
};

export type OpsQueueResponse = {
  summary: {
    total: number;
    open: number;
    stuck: number;
    approvalsPending: number;
    critical: number;
    assigned: number;
    unassigned: number;
  };
  items: OpsQueueItem[];
};