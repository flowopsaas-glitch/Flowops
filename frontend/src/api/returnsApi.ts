import { api } from "./client";

export type ReturnStatus =
  | "REQUESTED" | "APPROVED" | "REJECTED" | "SCHEDULED"
  | "IN_TRANSIT" | "RECEIVED" | "INSPECTING" | "COMPLETED" | "CANCELLED";

export type ReturnReason =
  | "DAMAGED" | "DEFECTIVE" | "WRONG_ITEM" | "NOT_AS_DESCRIBED"
  | "MISSING_PARTS" | "NO_LONGER_NEEDED" | "FAILED_DELIVERY" | "LATE_DELIVERY" | "OTHER";

export type ReturnResolution =
  | "PENDING" | "REFUND" | "REPLACEMENT" | "REPAIR" | "STORE_CREDIT" | "RESTOCK" | "DISPOSE";

export type ReturnCondition = "RESELLABLE" | "MINOR_DAMAGE" | "DAMAGED" | "UNUSABLE";

export type ReturnItem = {
  id: string;
  description: string;
  sku?: string | null;
  quantity: number;
  unitValue?: number | null;
  condition?: ReturnCondition | null;
  restocked: boolean;
};

export type ReturnRecord = {
  id: string;
  rmaNumber: string;
  trackingNumber?: string | null;
  waybillId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  pickupAddress?: string | null;
  reason: ReturnReason;
  reasonNote?: string | null;
  status: ReturnStatus;
  resolution: ReturnResolution;
  refundAmount?: number | null;
  restockFee?: number | null;
  currency: string;
  assignedDriverId?: string | null;
  assignedDriver?: { id: string; name: string; phone: string; status: string } | null;
  scheduledAt?: string | null;
  collectedAt?: string | null;
  receivedAt?: string | null;
  inspectionNotes?: string | null;
  condition?: ReturnCondition | null;
  restocked: boolean;
  resolvedAt?: string | null;
  items: ReturnItem[];
  waybill?: {
    id: string; trackingNumber: string; recipientName: string;
    codAmount?: number | null; totalAmount?: number | null; status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ReturnStats = {
  total: number;
  open: number;
  thisMonth: number;
  pendingApproval: number;
  awaitingCollection: number;
  inInspection: number;
  completed: number;
  statusCounts: Record<string, number>;
  resolutionCounts: Record<string, number>;
  refundsPaid: number;
  restockFeesCollected: number;
};

export type ReturnFilters = {
  status?: ReturnStatus | "";
  reason?: ReturnReason | "";
  resolution?: ReturnResolution | "";
  driverId?: string;
  search?: string;
};

export type CreateReturnPayload = {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  pickupAddress?: string;
  trackingNumber?: string;
  waybillId?: string;
  reason?: ReturnReason;
  reasonNote?: string;
  resolution?: ReturnResolution;
  refundAmount?: number;
  restockFee?: number;
  items?: Array<{
    description: string;
    sku?: string;
    quantity?: number;
    unitValue?: number;
    condition?: ReturnCondition;
  }>;
};

export type ReturnTransition =
  | "approve" | "reject" | "schedule" | "collect" | "receive" | "inspect" | "resolve" | "cancel";

export type TransitionPayload = {
  assignedDriverId?: string;
  scheduledAt?: string;
  resolution?: ReturnResolution;
  refundAmount?: number;
  restockFee?: number;
  condition?: ReturnCondition;
  restocked?: boolean;
  note?: string;
};

export async function listReturns(filters: ReturnFilters = {}): Promise<ReturnRecord[]> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v) params[k] = String(v);
  }
  const res: any = await api.get("/returns", { params });
  return Array.isArray(res) ? res : res?.data ?? [];
}

export async function getReturnStats(): Promise<ReturnStats> {
  const res: any = await api.get("/returns/stats");
  return res?.data ?? res;
}

export async function getReturn(id: string): Promise<ReturnRecord> {
  const res: any = await api.get(`/returns/${id}`);
  return res?.data ?? res;
}

export async function createReturn(payload: CreateReturnPayload): Promise<ReturnRecord> {
  const res: any = await api.post("/returns", payload);
  return res?.data ?? res;
}

export async function updateReturn(id: string, payload: Partial<CreateReturnPayload> & Record<string, any>): Promise<ReturnRecord> {
  const res: any = await api.patch(`/returns/${id}`, payload);
  return res?.data ?? res;
}

export async function transitionReturn(
  id: string,
  action: ReturnTransition,
  payload: TransitionPayload = {},
): Promise<ReturnRecord> {
  const res: any = await api.post(`/returns/${id}/transition/${action}`, payload);
  return res?.data ?? res;
}

export async function deleteReturn(id: string): Promise<{ deleted: boolean }> {
  const res: any = await api.delete(`/returns/${id}`);
  return res?.data ?? res;
}
