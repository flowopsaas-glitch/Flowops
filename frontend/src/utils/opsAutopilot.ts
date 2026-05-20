import type { ShipmentLike } from "./aiHeuristics";
import { riskScoreForShipment } from "./aiHeuristics";

export type PlaybookAction = {
  id: string;
  label: string;
  type: "PING_DRIVER" | "ASSIGN_DRIVER" | "NOTIFY_CUSTOMER" | "ESCALATE" | "REQUEST_POD" | "REROUTE_SUGGESTION";
  payload?: Record<string, any>;
};

export type PlaybookPlan = {
  name: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  reasons: string[];
  messageDrafts: {
    customerShort: string;
    customerDetailed: string;
    driver: string;
  };
  actions: PlaybookAction[];
};

export function buildPlaybookForShipment(s: ShipmentLike & {
  id?: string | number;
  customerName?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  origin?: string | null;
  destination?: string | null;
  waybill?: string | null;
}) : PlaybookPlan {
  const { score, reasons } = riskScoreForShipment(s);

  const severity =
    score >= 80 ? "CRITICAL" :
    score >= 65 ? "HIGH" :
    score >= 40 ? "MEDIUM" : "LOW";

  const customer = (s.customerName || "Customer").toString();
  const wb = (s.waybill || s.id || "shipment").toString();
  const route = `${(s.origin || "Origin").toString()} â†’ ${(s.destination || "Destination").toString()}`;

  // FREE â€œAI-likeâ€ drafts: deterministic, professional, consistent, fast.
  const customerShort =
    `Update on ${wb}: we're actively monitoring this delivery. We'll confirm ETA shortly.`;

  const customerDetailed =
    `Hi ${customer}, update on ${wb} (${route}). Our system flagged a potential delay risk, and operations is intervening now. ` +
    `Next step: ${nextStepText(s, score)}. We will send another update within 15 minutes.`;

  const driverMsg =
    `Ops check-in for ${wb}: please confirm current status + ETA. Reply with ETA in minutes and any issues.`;

  const actions: PlaybookAction[] = [];

  // Core playbook logic (FREE AI)
  if (s.driverAssigned === false) {
    actions.push({
      id: "assign_driver",
      label: "Suggest & assign best available driver (capacity-based)",
      type: "ASSIGN_DRIVER",
      payload: { strategy: "capacity_distance_zone" },
    });
  }

  if ((s.lastUpdateMinutesAgo ?? 0) > 45) {
    actions.push({
      id: "ping_driver",
      label: "Ping driver (tracking stale)",
      type: "PING_DRIVER",
      payload: { phone: s.driverPhone || null },
    });
    actions.push({
      id: "escalate_stale",
      label: "Escalate if no response in 10 minutes",
      type: "ESCALATE",
      payload: { reason: "STALE_TRACKING", afterMinutes: 10 },
    });
  }

  if (score >= 70 || s.isLate) {
    actions.push({
      id: "notify_customer",
      label: "Send proactive customer update (draft ready)",
      type: "NOTIFY_CUSTOMER",
      payload: { channel: "whatsapp_or_sms", draft: customerDetailed },
    });
    actions.push({
      id: "reroute",
      label: "Generate reroute suggestion (what-if simulation)",
      type: "REROUTE_SUGGESTION",
      payload: { method: "heuristic_simulation" },
    });
  }

  if ((s as any).podRequired && !(s as any).podCaptured) {
    actions.push({
      id: "request_pod",
      label: "Request POD now (photo/signature reminder)",
      type: "REQUEST_POD",
      payload: { driverPhone: s.driverPhone || null },
    });
  }

  // Always include a â€œconfirm ETAâ€ step for ops discipline
  actions.unshift({
    id: "confirm_eta",
    label: "Confirm ETA + next event time",
    type: "ESCALATE",
    payload: { reason: "CONFIRM_ETA", afterMinutes: 0 },
  });

  return {
    name: severity === "CRITICAL" ? "SLA Rescue Playbook" : "Ops Stabilization Playbook",
    severity,
    score,
    reasons,
    messageDrafts: {
      customerShort,
      customerDetailed,
      driver: driverMsg,
    },
    actions,
  };
}

function nextStepText(s: ShipmentLike, score: number) {
  if (s.driverAssigned === false) return "Assigning a driver immediately";
  if ((s.lastUpdateMinutesAgo ?? 0) > 45) return "Contacting the driver to restore tracking and confirm ETA";
  if (score >= 80) return "Rerouting to protect delivery SLA";
  if (s.isLate) return "Escalating to operations manager and updating ETA";
  return "Monitoring live updates";
}

// ---------- Audit trail (local, no backend needed) ----------
export type AutopilotAuditItem = {
  ts: string;
  shipmentId: string;
  playbookName: string;
  severity: string;
  score: number;
  selectedActionIds: string[];
  note?: string;
};

const KEY = "flowops_autopilot_audit";

export function addAudit(item: AutopilotAuditItem) {
  const existing = getAudit();
  existing.unshift(item);
  localStorage.setItem(KEY, JSON.stringify(existing.slice(0, 200)));
}

export function getAudit(): AutopilotAuditItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
