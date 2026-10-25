import { errorMessageOf } from "@/components/patterns/errorMessage";
import React, { useEffect, useMemo, useState } from "react";
import { useDismissOnEscape } from "./patterns/useDismissOnEscape";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./toast-context";

type SyncRecord = {
  id?: string | number;
  collectionId?: string | number;
  reference?: string;
  customerName?: string;
  destination?: string;
  status?: string;
  shipmentStatus?: string;
  dispatchStatus?: string;
  podStatus?: string;
  invoiceStatus?: string;
  shipmentLinked?: boolean;
  dispatchLinked?: boolean;
  podLinked?: boolean;
  invoiceLinked?: boolean;
  rateCardLinked?: boolean;
  shipmentId?: string | number | null;
  dispatchId?: string | number | null;
  podId?: string | number | null;
  invoiceId?: string | number | null;
  driverAssigned?: boolean;
  driverName?: string | null;
  driverId?: string | number | null;
  syncHealth?: string;
  aiFlags?: string[];
  aiPriority?: string;
  lastUpdatedAt?: string;
  links?: {
    shipmentId?: string | number | null;
    dispatchId?: string | number | null;
    podId?: string | number | null;
    invoiceId?: string | number | null;
    rateCardId?: string | number | null;
  };
};

type DashboardData = {
  totals?: Record<string, number>;
  moduleHealth?: Record<string, number>;
  records?: SyncRecord[];
};

type Driver = {
  id: string;
  name: string;
  vehicleType?: string;
  currentLoad?: number;
  maxLoad?: number;
  status?: string;
  rating?: number;
};

type WorkflowDrawerState = {
  collectionId: string;
  customerName: string;
  destination: string;
  syncHealth: string;
  priority: string;
  shipmentStatus: string;
  dispatchStatus: string;
  podStatus: string;
  invoiceStatus: string;
  driverName: string;
  driverAssigned: boolean;
  announcementLabel: string;
  driverLabel: string;
  nextActions: string[];
  recommendedDriverId?: string;
  recommendedDriverName?: string;
  recommendedVehicleType?: string;
  recommendedScore?: number;
};


type WorkflowSection = {
  status?: string; name?: string; id?: string | number; driverName?: string;
  driverId?: string | number; reference?: string; customerName?: string;
  destination?: string; syncHealth?: string; aiPriority?: string;
  [key: string]: unknown;
};
type CollectionWorkflow = {
  driver?: WorkflowSection | null;
  collection?: WorkflowSection | null;
  dispatch?: WorkflowSection | null;
  shipment?: WorkflowSection | null;
  pod?: WorkflowSection | null;
  invoice?: WorkflowSection | null;
  recommendedDriver?: WorkflowSection | null;
  nextActions?: unknown;
};

function truthText(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const cleaned = String(value).trim();
    if (cleaned) return cleaned;
  }
  return "";
}

function truthStatus(value: unknown, fallback: string) {
  const cleaned = truthText(value).replace(/[_-]+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.toUpperCase().replace(/\s+/g, "_");
}

function normalizeSyncHealth(value: unknown) {
  const v = truthStatus(value, "PARTIAL");
  if (v === "FULLY_SYNCED") return "SYNCED";
  return v;
}

function buildNextActions(resolved: { driverAssigned: boolean; dispatchStatus: string; syncHealth: string }, rawActions: unknown) {
  const items: string[] = [];

  if (Array.isArray(rawActions)) {
    for (const item of rawActions) {
      const label = truthText(item?.label, item?.title, item?.name, item?.action, item);
      if (label) items.push(label);
    }
  } else {
    const text = truthText(rawActions);
    if (text) {
      text
        .split(/[,|]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => items.push(part));
    }
  }

  if (!resolved.driverAssigned) items.push("Assign driver");
  if (resolved.dispatchStatus === "UNKNOWN") items.push("Create dispatch job");
  if (resolved.syncHealth !== "SYNCED") items.push("Repair sync");

  return [...new Set(items)];
}

function resolveCollectionTruth(
  record: SyncRecord,
  workflow: CollectionWorkflow | null | undefined,
  announcementLabel: string,
  fallbackActions: unknown,
) {
  const announcementDriverName = announcementLabel ? announcementLabel.split(" • ")[0] : "";

  const driverName = truthText(
    workflow?.driver?.name,
    workflow?.collection?.driverName,
    workflow?.dispatch?.driverName,
    record.driverName,
    announcementDriverName,
  );

  const driverId = truthText(
    workflow?.driver?.id,
    workflow?.dispatch?.driverId,
    workflow?.collection?.driverId,
    record.driverId,
  );

  const driverAssigned =
    Boolean(announcementLabel) ||
    Boolean(record.driverAssigned) ||
    Boolean(driverId) ||
    Boolean(driverName && driverName !== "Unassigned");

  const resolved = {
    collectionId: truthText(
      workflow?.collection?.reference,
      workflow?.collection?.id,
      record.reference,
      record.collectionId,
      record.id,
    ),
    customerName: truthText(workflow?.collection?.customerName, record.customerName, "Unknown"),
    destination: truthText(workflow?.collection?.destination, record.destination, "Unknown"),
    syncHealth: normalizeSyncHealth(workflow?.collection?.syncHealth || record.syncHealth),
    priority: truthStatus(workflow?.collection?.aiPriority || record.aiPriority, "NORMAL"),
    shipmentStatus: truthStatus(workflow?.shipment?.status || record.shipmentStatus, "PENDING_COLLECTION"),
    dispatchStatus: truthStatus(
      workflow?.dispatch?.status || record.dispatchStatus || (driverAssigned ? "ASSIGNED" : ""),
      driverAssigned ? "ASSIGNED" : "UNKNOWN",
    ),
    podStatus: truthStatus(workflow?.pod?.status || record.podStatus, "AWAITING_COLLECTION"),
    invoiceStatus: truthStatus(workflow?.invoice?.status || record.invoiceStatus, "DRAFT"),
    driverName: driverName || "Unassigned",
    driverAssigned,
  };

  return {
    ...resolved,
    nextActions: buildNextActions(resolved, workflow?.nextActions || fallbackActions),
  };
}

function formatLabel(value?: string | null) {
  if (!value) return "Unknown";
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function healthTone(value?: string) {
  const v = String(value || "").toUpperCase();
  if (v === "SYNCED" || v === "FULLY_SYNCED") return "green";
  if (v === "PARTIAL") return "amber";
  if (v === "BROKEN") return "red";
  return "slate";
}

function priorityTone(value?: string) {
  const v = String(value || "").toUpperCase();
  if (v === "HIGH") return "red";
  if (v === "MEDIUM") return "amber";
  if (v === "NORMAL") return "green";
  return "slate";
}

function flagTone(flag?: string) {
  const v = String(flag || "").toUpperCase();
  if (["BILLING_MISMATCH", "DELAY_RISK", "DISPATCH_DRIVER_MISMATCH"].includes(v)) return "red";
  if (["DRIVER_OVERLOAD", "POD_LAG", "UNASSIGNED"].includes(v)) return "amber";
  return "blue";
}

function extractDrivers(payload: unknown): Driver[] {
  const envelope = payload as { drivers?: unknown; items?: unknown; records?: unknown } | null;
  const source: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(envelope?.drivers)
    ? (envelope.drivers as unknown[])
    : Array.isArray(envelope?.items)
    ? (envelope.items as unknown[])
    : Array.isArray(envelope?.records)
    ? (envelope.records as unknown[])
    : [];

  return source.map((raw) => { const item = (raw ?? {}) as Record<string, unknown>; return ({
    id: String(item?.id ?? item?.driverId ?? item?.value ?? ""),
    name: truthText(item?.name, item?.driverName, item?.fullName, `Driver ${item?.id ?? ""}`),
    vehicleType: truthText(item?.vehicleType, item?.vehicle, item?.vehicle_class),
    currentLoad: Number(item?.currentLoad ?? item?.load ?? item?.activeAssignments ?? 0),
    maxLoad: Number(item?.maxLoad ?? item?.capacity ?? item?.maxAssignments ?? 0),
    status: truthText(item?.status, item?.availability, "AVAILABLE"),
    rating: item?.rating != null ? Number(item.rating) : undefined,
  }); }).filter((d: Driver) => d.id && d.name);
}

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 28%), radial-gradient(circle at top right, rgba(14,165,233,0.19), transparent 24%), radial-gradient(circle at bottom left, rgba(67,56,202,0.16), transparent 22%), linear-gradient(135deg, #020617 0%, #071227 42%, #0b1730 100%)",
  padding: 20,
};

const pageWidthStyle: React.CSSProperties = {
  maxWidth: 1720,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const glassPanel: React.CSSProperties = {
  background: "rgba(7, 15, 33, 0.82)",
  border: "1px solid rgba(96, 165, 250, 0.16)",
  borderRadius: 28,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 32px 80px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 44,
  fontWeight: 950,
  textShadow: "0 12px 28px rgba(0,0,0,0.28)",
  letterSpacing: "-0.035em",
  lineHeight: 1.15,
};

const subtleText: React.CSSProperties = {
  color: "#94a9c2",
  fontSize: 14,
  lineHeight: 1.6,
};

const sectionHeading: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: "-0.01em",
};

function buttonStyle(tone: "blue" | "green" | "amber" | "red" | "slate"): React.CSSProperties {
  const map = {
    blue: {
      background: "linear-gradient(135deg, #2563eb, #3b82f6)",
      color: "#eff6ff",
      border: "1px solid rgba(96,165,250,0.35)",
    },
    green: {
      background: "linear-gradient(135deg, #059669, #10b981)",
      color: "#ecfdf5",
      border: "1px solid rgba(52,211,153,0.28)",
    },
    amber: {
      background: "linear-gradient(135deg, #d97706, #f59e0b)",
      color: "#fff7ed",
      border: "1px solid rgba(251,191,36,0.26)",
    },
    red: {
      background: "linear-gradient(135deg, #dc2626, #ef4444)",
      color: "#fff1f2",
      border: "1px solid rgba(248,113,113,0.28)",
    },
    slate: {
      background: "rgba(51,65,85,0.82)",
      color: "#e2e8f0",
      border: "1px solid rgba(148,163,184,0.18)",
    },
  }[tone];

  return {
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 900,
    textShadow: "0 10px 24px rgba(0,0,0,0.24)",
    cursor: "pointer",
    transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
    outline: "none",
    ...map,
  };
}

function miniButtonStyle(tone: "blue" | "green" | "amber" | "red" | "slate"): React.CSSProperties {
  return {
    ...buttonStyle(tone),
    padding: "9px 12px",
    fontSize: 12,
    borderRadius: 12,
  };
}

function badgeStyle(tone: "green" | "amber" | "red" | "blue" | "slate"): React.CSSProperties {
  const map = {
    green: {
      background: "rgba(16,185,129,0.14)",
      color: "#86efac",
      border: "1px solid rgba(16,185,129,0.26)",
    },
    amber: {
      background: "rgba(245,158,11,0.14)",
      color: "#fcd34d",
      border: "1px solid rgba(245,158,11,0.26)",
    },
    red: {
      background: "rgba(239,68,68,0.14)",
      color: "#fca5a5",
      border: "1px solid rgba(239,68,68,0.28)",
    },
    blue: {
      background: "rgba(59,130,246,0.14)",
      color: "#93c5fd",
      border: "1px solid rgba(59,130,246,0.26)",
    },
    slate: {
      background: "rgba(148,163,184,0.11)",
      color: "#cbd5e1",
      border: "1px solid rgba(148,163,184,0.20)",
    },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    textShadow: "0 10px 24px rgba(0,0,0,0.24)",
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
    ...map,
  };
}

function StatCard({
  title,
  value,
  sub,
  isPrimary = false,
}: {
  title: string;
  value: string | number;
  sub: string;
  isPrimary?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 24,
        padding: isPrimary ? 22 : 18,
        background: isPrimary
          ? "linear-gradient(180deg, rgba(15,23,45,0.98) 0%, rgba(8,15,35,0.96) 100%)"
          : "linear-gradient(180deg, rgba(8,15,35,0.96) 0%, rgba(5,10,24,0.94) 100%)",
        border: isPrimary
          ? "1px solid rgba(96,165,250,0.22)"
          : "1px solid rgba(59,130,246,0.14)",
        boxShadow: isPrimary
          ? "0 12px 32px rgba(37,99,235,0.12)"
          : "0 8px 24px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          fontSize: isPrimary ? 12 : 11,
          fontWeight: 950,
          textShadow: "0 10px 24px rgba(0,0,0,0.24)",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: isPrimary ? "rgba(148,175,200,0.98)" : "rgba(148,163,184,0.95)",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: isPrimary ? 32 : 28,
          fontWeight: 950,
          textShadow: "0 10px 24px rgba(0,0,0,0.24)",
          lineHeight: 1,
          letterSpacing: -0.8,
          color: "#f8fafc",
          marginTop: 6,
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: isPrimary ? 14 : 13,
          lineHeight: 1.5,
          color: isPrimary ? "rgba(148,175,200,0.92)" : "rgba(148,163,184,0.95)",
          marginTop: 8,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function PriorityStrip({
  label,
  count,
  tone,
  description,
  isPrimary = false,
}: {
  label: string;
  count: number;
  tone: "green" | "amber" | "red" | "blue" | "slate";
  description: string;
  isPrimary?: boolean;
}) {
  return (
    <div
      style={{
        ...glassPanel,
        padding: isPrimary ? 18 : 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: isPrimary ? "rgba(15,23,45,0.88)" : "rgba(7, 15, 33, 0.82)",
        border: isPrimary
          ? "1px solid rgba(96,165,250,0.18)"
          : "1px solid rgba(96, 165, 250, 0.16)",
      }}
    >
      <div>
        <div
          style={{
            color: "#f8fafc",
            fontWeight: 950,
            textShadow: "0 10px 24px rgba(0,0,0,0.24)",
            marginBottom: 6,
            fontSize: isPrimary ? 16 : 15,
          }}
        >
          {label}
        </div>
        <div style={{ color: "#8da2c0", fontSize: 12, lineHeight: 1.4 }}>{description}</div>
      </div>
      <div style={badgeStyle(tone)}>{count}</div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div
      style={{
        ...glassPanel,
        padding: 24,
        color: "#cbd5e1",
        display: "flex",
        justifyContent: "center",
      }}
    >
      Loading live collection records...
    </div>
  );
}

const statusCardStyle: React.CSSProperties = {
  background: "rgba(8,16,34,0.76)",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 18,
  padding: 14,
};

const statusLabelStyle: React.CSSProperties = {
  color: "#7f94b2",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const statusValueStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 900,
  marginTop: 8,
};

const drawerPanelStyle: React.CSSProperties = {
  background: "rgba(8,16,34,0.76)",
  border: "1px solid rgba(96,165,250,0.14)",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 12,
  margin: 16,
};

const drawerInnerCardStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.7)",
  border: "1px solid rgba(71,85,105,0.28)",
  borderRadius: 14,
  padding: 12,
};

export default function Collections() {

  const { showToast } = useToast();
  const [, setLiveRefreshTick] = useState(0);

  const requestLiveRefresh = () => {
    setTimeout(() => {
      setLiveRefreshTick((value) => value + 1);
    }, 120);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveRefreshTick((value) => value + 1);
    }, 25000);

    return () => window.clearInterval(timer);
  }, []);




  const { token } = useAuth();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [driversLoading, setDriversLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "NORMAL" | "BROKEN">("ALL");
  const [driverAnnouncements, setDriverAnnouncements] = useState<Record<string, string>>({});
  const [workflowDrawer, setWorkflowDrawer] = useState<WorkflowDrawerState | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [drawerMessage, setDrawerMessage] = useState("");
  const [drawerSelectedDriverId, setDrawerSelectedDriverId] = useState("");

  // Stable identity (memoised on the dashboard snapshot) so downstream
  // memos keyed on moduleHealth do not recompute on every render.
  const moduleHealth = useMemo(() => dashboard?.moduleHealth ?? {}, [dashboard]);

  const linkedCounts = useMemo(() => {
    const base = Array.isArray(records) ? records : [];

    const hasLink = (value: unknown) => {
      if (value === undefined || value === null) return false;
      const cleaned = String(value).trim().toLowerCase();
      return cleaned !== "" && cleaned !== "null" && cleaned !== "undefined";
    };

    const shipmentCount = base.filter((r) =>
      Boolean(r?.shipmentLinked) || hasLink(r?.links?.shipmentId) || hasLink(r?.shipmentId)
    ).length

    const dispatchCount = base.filter((r) =>
      Boolean(r?.dispatchLinked) || hasLink(r?.links?.dispatchId) || hasLink(r?.dispatchId)
    ).length

    const podCount = base.filter((r) =>
      Boolean(r?.podLinked) || hasLink(r?.links?.podId) || hasLink(r?.podId)
    ).length

    const invoiceCount = base.filter((r) =>
      Boolean(r?.invoiceLinked) || hasLink(r?.links?.invoiceId) || hasLink(r?.invoiceId)
    ).length

    return {
      shipments:
        Number(moduleHealth?.shipmentsLinked ?? moduleHealth?.shipmentLinked ?? 0) || shipmentCount,
      dispatch:
        Number(moduleHealth?.dispatchLinked ?? 0) || dispatchCount,
      pod:
        Number(moduleHealth?.podLinked ?? 0) || podCount,
      invoice:
        Number(moduleHealth?.invoiceLinked ?? 0) || invoiceCount,
    };
  }, [records, moduleHealth]);


  useEffect(() => {
    if (!token) return;
    fetchLayer();
    fetchDrivers();
  }, [token]);

  const normalizedRecords = useMemo(() => {
    return (Array.isArray(records) ? records : []).map((record) => {
      const collectionKey = String(record.collectionId || record.id || "");
      const announcementLabel = driverAnnouncements[collectionKey] || "";
      return {
        raw: record,
        resolved: resolveCollectionTruth(record, {}, announcementLabel, []),
        announcementLabel,
      };
    });
  }, [records, driverAnnouncements]);

  const { highRiskCount, mediumRiskCount, healthyCount } = useMemo(() => {
    let high = 0;
    let medium = 0;
    let healthy = 0;

    normalizedRecords.forEach(({ resolved }) => {
      const priority = String(resolved.priority || "").toUpperCase();
      const health = String(resolved.syncHealth || "").toUpperCase();

      if (priority === "HIGH" || health === "BROKEN") high += 1;
      else if (priority === "MEDIUM" || health === "PARTIAL") medium += 1;
      else healthy += 1;
    });

    return { highRiskCount: high, mediumRiskCount: medium, healthyCount: healthy };
  }, [normalizedRecords]);

  const filteredRecords = useMemo(() => {
    return normalizedRecords.filter(({ resolved }) => {
      const priority = String(resolved.priority || "").toUpperCase();
      const health = String(resolved.syncHealth || "").toUpperCase();

      if (filter === "ALL") return true;
      if (filter === "BROKEN") return health === "BROKEN";
      if (filter === "HIGH") return priority === "HIGH" || health === "BROKEN";
      if (filter === "MEDIUM") return priority === "MEDIUM" || health === "PARTIAL";
      if (filter === "NORMAL") return priority === "NORMAL" && health === "SYNCED";
      return true;
    });
  }, [filter, normalizedRecords]);

  // Promise-chain form: every state update lands in a .then/.catch/.finally
  // callback, never synchronously inside the effect that triggers the load.
  function fetchLayer() {
    return Promise.all([
      api.get("/collections-state-sync/dashboard"),
      api.get("/collections-state-sync/records"),
    ]).then(([dashboardRes, recordsRes]) => {
      setDashboard(dashboardRes.data || {});
      setRecords(
        Array.isArray(recordsRes.data)
          ? recordsRes.data
          : Array.isArray(recordsRes.data?.records)
          ? recordsRes.data.records
          : [],
      );
      setError("");
    }).catch((err: unknown) => {
      setError(errorMessageOf(err) || "Failed to load Collections command center.");
      setDashboard((prev) => prev || { totals: {}, moduleHealth: {}, records: [] });
      setRecords((prev) => (Array.isArray(prev) ? prev : []));
    }).finally(() => {
      setLoading(false);
    });
  }

  function fetchDrivers() {
    return api.get("/drivers", { params: { status: "AVAILABLE" } })
      .then((res) => {
        setDrivers(extractDrivers(res.data));
      })
      .catch(() => {
        setDrivers([]);
      })
      .finally(() => {
        setDriversLoading(false);
      });
  }

  async function runBulkSync() {
    setBulkBusy(true);
    try {
      const response = await api.post("/collections-state-sync/bulk-sync", {
        actor: "collections-command-center-production",
      });
      await fetchLayer();
      showToast(`Bulk sync completed. Synced records: ${response.data?.synced ?? 0}`, "success");
    } catch (err) {
      showToast(errorMessageOf(err) || "Bulk sync repair failed.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function syncOne(collectionId: string) {
    setBusyId(collectionId);
    try {
      const response = await api.post(`/collections-state-sync/sync/${collectionId}`, {
        actor: "collections-command-center-production",
      });
      requestLiveRefresh();

      const data = response.data;
      await fetchLayer();

      const changed = [
        data?.collectionUpdated ? "Collection" : null,
        data?.dispatchCreated || data?.dispatchUpdated ? "Dispatch" : null,
        data?.podCreated || data?.podUpdated ? "POD" : null,
        data?.invoiceCreated || data?.invoiceUpdated ? "Invoice" : null,
      ]
        .filter(Boolean)
        .join(", ");

      showToast(`Sync completed for ${collectionId}. Updated: ${changed || "No linked changes needed"}`, "success");
    } catch (err) {
      showToast(errorMessageOf(err) || "Record sync failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function getSuggestedDriver(collectionId: string) {
    try {
      const response = await api.get(`/collections-state-sync/suggest-driver/${collectionId}`);
      return response.data;
    } catch {
      return null;
    }
  }

  async function autoAssignDriver(collectionId: string) {
    const suggested = await getSuggestedDriver(collectionId);
    const driverId = suggested?.suggestion?.id || drivers[0]?.id;
    if (!driverId) {
      throw new Error("No available driver to assign");
    }
    const response = await api.post(`/collections/${collectionId}/assign-driver`, { driverId });
    return response.data;
  }

  async function assignDriverToCollection(collectionId: string, driverId: string) {
    return await api.post(`/collections/${collectionId}/assign-driver`, { driverId });
  }

  async function releaseDriverFromCollection(collectionId: string) {
    return await api.post(`/collections/${collectionId}/release-driver`);
  }

  useDismissOnEscape(Boolean(workflowDrawer), closeWorkflowDrawer);
  function closeWorkflowDrawer() {
    setWorkflowDrawer(null);
    setDrawerBusy(false);
    setDrawerMessage("");
    setDrawerSelectedDriverId("");
  }

  async function refreshWorkflowDrawer() {
    if (!workflowDrawer?.collectionId) return;
    const liveRecord = records.find(
      (item) => String(item.collectionId || item.id || "") === String(workflowDrawer.collectionId)
    );
    if (!liveRecord) {
      setDrawerMessage("Live record not found for drawer refresh.");
      return;
    }
    setDrawerMessage("");
    await openLinkedWorkflow(liveRecord);
  }

  async function assignDrawerRecommendedDriver() {
    if (!workflowDrawer?.collectionId) return;
    try {
      setDrawerBusy(true);
      setDrawerMessage("");
      await autoAssignDriver(String(workflowDrawer.collectionId));
      requestLiveRefresh();
      await fetchLayer();

      const liveRecord = records.find(
        (item) => String(item.collectionId || item.id || "") === String(workflowDrawer.collectionId)
      );
      if (liveRecord) await openLinkedWorkflow(liveRecord);

      setDrawerMessage("Best driver assigned successfully.");
    } catch (error) {
      setDrawerMessage(errorMessageOf(error) || "Driver assignment failed.");
    } finally {
      setDrawerBusy(false);
    }
  }

  async function applyDrawerManualDriver() {
    if (!workflowDrawer?.collectionId) return;

    const selectedDriver = drivers.find((d) => String(d.id) === String(drawerSelectedDriverId));
    if (!selectedDriver) {
      setDrawerMessage("Select a valid driver first.");
      return;
    }

    try {
      setDrawerBusy(true);
      setDrawerMessage("");

      await assignDriverToCollection(String(workflowDrawer.collectionId), String(selectedDriver.id));

      const manualLabel = `${selectedDriver.name} • Manual override • operator`;
      setDriverAnnouncements((prev) => ({
        ...prev,
        [String(workflowDrawer.collectionId)]: manualLabel,
      }));

      await fetchLayer();

      const liveRecord = records.find(
        (item) => String(item.collectionId || item.id || "") === String(workflowDrawer.collectionId)
      );
      if (liveRecord) await openLinkedWorkflow(liveRecord);

      setDrawerMessage("Manual driver assignment applied successfully.");
    } catch (error) {
      setDrawerMessage(errorMessageOf(error) || "Manual driver assignment failed.");
    } finally {
      setDrawerBusy(false);
    }
  }

  async function releaseDrawerDriver() {
    if (!workflowDrawer?.collectionId) return;

    try {
      setDrawerBusy(true);
      setDrawerMessage("");

      await releaseDriverFromCollection(String(workflowDrawer.collectionId));
      requestLiveRefresh();

      setDriverAnnouncements((prev) => {
        const next = { ...prev };
        delete next[String(workflowDrawer.collectionId)];
        return next;
      });

      setDrawerSelectedDriverId("");
      await fetchLayer();

      const liveRecord = records.find(
        (item) => String(item.collectionId || item.id || "") === String(workflowDrawer.collectionId)
      );
      if (liveRecord) await openLinkedWorkflow(liveRecord);

      setDrawerMessage("Driver released successfully.");
    } catch (error) {
      setDrawerMessage(errorMessageOf(error) || "Driver release failed.");
    } finally {
      setDrawerBusy(false);
    }
  }

  async function repairDrawerSync() {
    if (!workflowDrawer?.collectionId) return;
    try {
      setDrawerBusy(true);
      setDrawerMessage("");
      await syncOne(String(workflowDrawer.collectionId));
      requestLiveRefresh();

      const liveRecord = records.find(
        (item) => String(item.collectionId || item.id || "") === String(workflowDrawer.collectionId)
      );
      if (liveRecord) await openLinkedWorkflow(liveRecord);

      setDrawerMessage("Workflow sync repaired successfully.");
    } catch (error) {
      setDrawerMessage(errorMessageOf(error) || "Workflow sync repair failed.");
    } finally {
      setDrawerBusy(false);
    }
  }

  async function openLinkedWorkflow(record: SyncRecord) {
    try {
      const collectionKey = String(record.collectionId || record.id || "");
      const rememberedAnnouncement = driverAnnouncements[collectionKey] || "";

      const [workflowRes, suggestion] = await Promise.all([
        api.get(`/collections/${collectionKey}/workflow`),
        getSuggestedDriver(collectionKey),
      ]);

      const workflow = workflowRes.data || {};
      const resolved = resolveCollectionTruth(record, workflow, rememberedAnnouncement, workflow?.nextActions || []);

      const recommendedDriverId = truthText(
        suggestion?.recommendedDriver?.id,
        suggestion?.driver?.id,
        suggestion?.id,
      );

      const recommendedDriverName = truthText(
        suggestion?.recommendedDriver?.name,
        suggestion?.driver?.name,
        suggestion?.name,
        workflow?.recommendedDriver?.name,
      );

      const recommendedVehicleType = truthText(
        suggestion?.recommendedDriver?.vehicleType,
        suggestion?.driver?.vehicleType,
        workflow?.recommendedDriver?.vehicleType,
        "Vehicle linked",
      );

      const recommendedScoreRaw =
        suggestion?.recommendedDriver?.score ??
        suggestion?.driver?.score ??
        workflow?.recommendedDriver?.score ??
        92;

      const announcementDriverName = truthText(
        rememberedAnnouncement.split(" • ")[0],
        workflow?.driver?.name,
        recommendedDriverName,
      );

      const driverLabel = resolved.driverAssigned
        ? truthText(workflow?.driver?.name, resolved.driverName, announcementDriverName, "Assigned")
        : "Unassigned";

      setWorkflowDrawer({
        collectionId: collectionKey,
        customerName: resolved.customerName,
        destination: resolved.destination,
        syncHealth: resolved.syncHealth,
        priority: resolved.priority,
        shipmentStatus: resolved.shipmentStatus,
        dispatchStatus: resolved.dispatchStatus,
        podStatus: resolved.podStatus,
        invoiceStatus: resolved.invoiceStatus,
        driverName: resolved.driverAssigned ? driverLabel : "Unassigned",
        driverAssigned: resolved.driverAssigned,
        announcementLabel: rememberedAnnouncement || (resolved.driverAssigned ? `${driverLabel} • Live assignment` : "No recommendation"),
        driverLabel,
        nextActions: Array.isArray(resolved.nextActions) ? resolved.nextActions : [],
        recommendedDriverId: recommendedDriverId || undefined,
        recommendedDriverName: recommendedDriverName || "Best Available",
        recommendedVehicleType,
        recommendedScore: Number(recommendedScoreRaw),
      });

      setDrawerSelectedDriverId("");
      setDrawerMessage("");
    } catch (err) {
      showToast(errorMessageOf(err) || "Failed to open workflow.", "error");
    }
  }

  return (
    <div style={shellStyle}>
      <div style={pageWidthStyle}>
        <section style={{ ...glassPanel, padding: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 32,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div style={{ maxWidth: 920, flex: 1 }}>
              <div style={{ ...badgeStyle("blue"), marginBottom: 14 }}>✦ FlowOps Collections AI Ops Layer</div>
              <h1 style={titleStyle}>Collections Executive AI Command Center</h1>
              <div style={{ ...subtleText, marginTop: 10, maxWidth: 880 }}>
                Premium operational command surface for cross-module collection truth,
                driver allocation, sync integrity, and real-time AI supervision across
                Shipments, Dispatch, POD, and Invoicing.
              </div>

              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 12 }}>
                <span style={badgeStyle("blue")}>● System Live</span>
                <span style={badgeStyle("slate")}>⚠ Alerts: {highRiskCount + mediumRiskCount}</span>
                <span style={badgeStyle("blue")}>📊 Records: {records.length}</span>
                <span style={badgeStyle(driversLoading ? "amber" : "green")}>
                  {driversLoading ? "Loading Drivers" : `Drivers: ${drivers.length}`}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={fetchLayer} style={buttonStyle("blue")}>↻ Refresh Layer</button>
              <button onClick={fetchDrivers} style={buttonStyle("slate")}>↻ Refresh Drivers</button>
              <button onClick={runBulkSync} style={buttonStyle("green")} disabled={bulkBusy}>
                {bulkBusy ? "⟳ Repairing..." : "✓ Fix Sync"}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section
            style={{
              ...glassPanel,
              padding: 20,
              border: "1px solid rgba(239,68,68,0.32)",
              color: "#fecaca",
            }}
          >
            <div style={{ fontWeight: 950, textShadow: "0 10px 24px rgba(0,0,0,0.24)", marginBottom: 8 }}>
              ⚠ Collections Command Center Error
            </div>
            <div style={{ fontSize: 14 }}>{error}</div>
          </section>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14,
          }}
        >
          <StatCard title="Collections" value={records.length} sub="Total active records" isPrimary />
          <StatCard title="Fully Synced" value={healthyCount} sub="Healthy state" />
          <StatCard title="Partial Sync" value={mediumRiskCount} sub="Partial sync" />
          <StatCard title="Broken Sync" value={highRiskCount} sub="Critical state" isPrimary={highRiskCount > 0} />
          <StatCard
            title="Pending Driver"
            value={normalizedRecords.filter((r) => !r.resolved.driverAssigned).length}
            sub="Unassigned"
            isPrimary={normalizedRecords.filter((r) => !r.resolved.driverAssigned).length > 0}
          />
          <StatCard title="Delay Risk" value={records.filter((r) => r.aiFlags?.includes("DELAY_RISK")).length} sub="At risk" />
          <StatCard title="Overload Risk" value={records.filter((r) => r.aiFlags?.includes("DRIVER_OVERLOAD")).length} sub="Driver load" />
          <StatCard
            title="Billing Mismatch"
            value={records.filter((r) => r.aiFlags?.includes("BILLING_MISMATCH")).length}
            sub="Invoice drift"
            isPrimary={records.filter((r) => r.aiFlags?.includes("BILLING_MISMATCH")).length > 0}
          />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ ...glassPanel, padding: 20 }}>
              <h2 style={sectionHeading}>AI Priority Stack</h2>
              <div style={{ fontSize: 12, color: "#8da2c0", marginTop: 4 }}>Urgency-weighted command supervision</div>

              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                <PriorityStrip
                  label="High Risk"
                  count={highRiskCount}
                  tone="red"
                  description="Broken sync, billing mismatch, dispatch-driver mismatch, critical delays."
                  isPrimary={highRiskCount > 0}
                />
                <PriorityStrip
                  label="Medium Risk"
                  count={mediumRiskCount}
                  tone="amber"
                  description="Unassigned collections, overload drift, POD lag, incomplete sync."
                  isPrimary={mediumRiskCount > 0 && highRiskCount === 0}
                />
                <PriorityStrip
                  label="Healthy"
                  count={healthyCount}
                  tone="green"
                  description="Records aligned across modules with normal AI priority."
                />
              </div>

              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatCard title="Shipments Linked" value={linkedCounts.shipments} sub="Bridge connected" />
                <StatCard title="Dispatch Linked" value={linkedCounts.dispatch} sub="Bridge connected" />
                <StatCard title="POD Linked" value={linkedCounts.pod} sub="Bridge connected" />
                <StatCard title="Invoice Linked" value={linkedCounts.invoice} sub="Bridge connected" />
              </div>
            </div>
          </div>

          <div style={{ ...glassPanel, padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 12,
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h2 style={sectionHeading}>Command Filters</h2>
              <div style={{ ...subtleText, fontSize: 12 }}>Filter by urgency</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
              <button style={buttonStyle(filter === "ALL" ? "blue" : "slate")} onClick={() => setFilter("ALL")}>All</button>
              <button style={buttonStyle(filter === "HIGH" ? "red" : "slate")} onClick={() => setFilter("HIGH")}>High</button>
              <button style={buttonStyle(filter === "MEDIUM" ? "amber" : "slate")} onClick={() => setFilter("MEDIUM")}>Medium</button>
              <button style={buttonStyle(filter === "NORMAL" ? "green" : "slate")} onClick={() => setFilter("NORMAL")}>Normal</button>
              <button style={buttonStyle(filter === "BROKEN" ? "red" : "slate")} onClick={() => setFilter("BROKEN")}>Broken</button>
            </div>

            <h2 style={sectionHeading}>Live Command Grid</h2>
            <div style={{ ...subtleText, fontSize: 12, marginTop: 4, marginBottom: 16 }}>
              Real-time operational records with AI flags and sync status.
            </div>

            {loading ? (
              <LoadingRow />
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {filteredRecords.map(({ raw, resolved, announcementLabel }) => {
                  const collectionId = String(raw.collectionId || raw.id || "");
                  const isBusy = busyId === collectionId;

                  return (
                    <div key={collectionId} style={{ ...glassPanel, padding: 16, display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={statusLabelStyle}>Collection ID</div>
                          <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 900, marginTop: 6 }}>
                            {resolved.collectionId}
                          </div>
                        </div>
                        <div style={{ color: "#94a9c2", fontSize: 12 }}>
                          Updated: {formatDate(raw.lastUpdatedAt)}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>Customer</div>
                          <div style={statusValueStyle}>{resolved.customerName}</div>
                        </div>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>Destination</div>
                          <div style={statusValueStyle}>{resolved.destination}</div>
                        </div>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>Sync Health</div>
                          <span style={badgeStyle(healthTone(resolved.syncHealth))}>{formatLabel(resolved.syncHealth)}</span>
                        </div>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>AI Priority</div>
                          <span style={badgeStyle(priorityTone(resolved.priority))}>{formatLabel(resolved.priority)}</span>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>Shipment</div>
                          <div style={statusValueStyle}>{formatLabel(resolved.shipmentStatus)}</div>
                        </div>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>Dispatch</div>
                          <div style={statusValueStyle}>{formatLabel(resolved.dispatchStatus)}</div>
                        </div>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>POD</div>
                          <div style={statusValueStyle}>{formatLabel(resolved.podStatus)}</div>
                        </div>
                        <div style={statusCardStyle}>
                          <div style={statusLabelStyle}>Invoice</div>
                          <div style={statusValueStyle}>{formatLabel(resolved.invoiceStatus)}</div>
                        </div>
                      </div>

                      <div
                        style={{
                          background: "rgba(15,23,42,0.72)",
                          border: "1px solid rgba(71,85,105,0.28)",
                          borderRadius: 16,
                          padding: 14,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={statusLabelStyle}>Driver Truth</div>
                            <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 900, marginTop: 6 }}>
                              {resolved.driverAssigned ? resolved.driverName : "Unassigned"}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={badgeStyle(resolved.driverAssigned ? "green" : "amber")}>
                            {resolved.driverAssigned ? "Driver Assigned" : "Needs Driver"}
                          </span>
                          {announcementLabel ? <span style={badgeStyle("blue")}>{announcementLabel}</span> : null}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {(raw.aiFlags || []).length > 0 ? (
                            raw.aiFlags!.map((flag) => (
                              <span key={flag} style={badgeStyle(flagTone(flag))}>{formatLabel(flag)}</span>
                            ))
                          ) : (
                            <span style={badgeStyle("green")}>No Active Flags</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={() => openLinkedWorkflow(raw)} style={miniButtonStyle("blue")}>
                          Open Workflow
                        </button>

                        <button
                          onClick={() => syncOne(collectionId)}
                          style={miniButtonStyle("green")}
                          disabled={isBusy}
                        >
                          {isBusy ? "Syncing..." : "Sync Now"}
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await autoAssignDriver(collectionId);
                              await fetchLayer();
                              await fetchDrivers();
                              showToast("Driver auto-assigned successfully!", "success");
                            } catch (e) {
                              showToast(errorMessageOf(e) || "Auto-assign failed.", "error");
                            }
                          }}
                          style={miniButtonStyle("amber")}
                        >
                          Auto-Assign Driver
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await releaseDriverFromCollection(collectionId);
                              await fetchLayer();
                              await fetchDrivers();
                              showToast("Driver released successfully!", "success");
                            } catch (e) {
                              showToast(errorMessageOf(e) || "Release driver failed.", "error");
                            }
                          }}
                          style={miniButtonStyle("red")}
                        >
                          Release Driver
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {records.length === 0 && !loading && (
          <section style={{ ...glassPanel, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h3 style={{ ...sectionHeading, fontSize: 22, marginBottom: 8 }}>Command Grid Ready</h3>
            <div style={{ ...subtleText, marginBottom: 16, maxWidth: 600, margin: "0 auto 16px" }}>
              The command grid is prepared and waiting for operational records. Refresh the
              command layer to load live collection data, or use the bulk sync tool to initialize
              records across all modules.
            </div>
            <button onClick={fetchLayer} style={buttonStyle("blue")}>↻ Load Records Now</button>
          </section>
        )}

        {workflowDrawer ? (
          <>
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2,6,23,0.56)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                zIndex: 60,
              }}
            >
              <button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={closeWorkflowDrawer} />
            </div>

            <aside role="dialog" aria-modal="true" aria-label="Collection workflow"
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                width: "min(520px, 94vw)",
                height: "100vh",
                background: "linear-gradient(180deg, rgba(5,10,24,0.98) 0%, rgba(7,15,33,0.98) 100%)",
                borderLeft: "1px solid rgba(96,165,250,0.18)",
                boxShadow: "-24px 0 60px rgba(2,6,23,0.42)",
                zIndex: 70,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  padding: 20,
                  borderBottom: "1px solid rgba(96,165,250,0.12)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: "#7f94b2", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Workflow Control
                  </div>
                  <div style={{ color: "#f8fafc", fontSize: 20, fontWeight: 900, marginTop: 6 }}>
                    {workflowDrawer.customerName}
                  </div>
                  <div style={{ color: "#94a9c2", fontSize: 13, marginTop: 6 }}>
                    {workflowDrawer.collectionId} • {workflowDrawer.destination}
                  </div>
                </div>

                <button onClick={closeWorkflowDrawer} style={buttonStyle("slate")}>Close</button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                  padding: 16,
                  borderBottom: "1px solid rgba(96,165,250,0.12)",
                }}
              >
                {[
                  ["Sync Health", workflowDrawer.syncHealth],
                  ["Priority", workflowDrawer.priority],
                  ["Shipment", workflowDrawer.shipmentStatus],
                  ["Dispatch", workflowDrawer.dispatchStatus],
                  ["POD", workflowDrawer.podStatus],
                  ["Invoice", workflowDrawer.invoiceStatus],
                ].map(([label, value]) => (
                  <div key={label} style={statusCardStyle}>
                    <div style={statusLabelStyle}>{label}</div>
                    <div style={{ color: "#f8fafc", fontSize: 17, fontWeight: 900, marginTop: 8 }}>
                      {formatLabel(value)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={drawerPanelStyle}>
                <div>
                  <div style={statusLabelStyle}>Driver Truth</div>
                  <div style={{ color: "#f8fafc", fontSize: 24, fontWeight: 900, marginTop: 8 }}>
                    {workflowDrawer.driverAssigned ? workflowDrawer.driverName : "Unassigned"}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(37,99,235,0.09)",
                    border: "1px solid rgba(96,165,250,0.18)",
                    borderRadius: 14,
                    padding: 12,
                    color: "#bfdbfe",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {workflowDrawer.announcementLabel
                    ? `Assigned Driver: ${workflowDrawer.announcementLabel}`
                    : `Driver Status: ${workflowDrawer.driverLabel}`}
                </div>

                <div style={drawerInnerCardStyle}>
                  <div style={statusLabelStyle}>Recommended Driver</div>
                  <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 900, marginTop: 6 }}>
                    {workflowDrawer.recommendedDriverName || "Best Available"}
                  </div>
                  <div style={{ color: "#94a9c2", fontSize: 12, marginTop: 4 }}>
                    {workflowDrawer.recommendedVehicleType} • Score: {workflowDrawer.recommendedScore}%
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={assignDrawerRecommendedDriver} style={buttonStyle("blue")} disabled={drawerBusy}>
                    {drawerBusy ? "Assigning..." : "Assign Recommended Driver"}
                  </button>
                  <button onClick={releaseDrawerDriver} style={buttonStyle("red")} disabled={drawerBusy}>
                    {drawerBusy ? "Releasing..." : "Release Driver"}
                  </button>
                </div>

                <div style={drawerInnerCardStyle}>
                  <div style={statusLabelStyle}>Manual Driver Assignment</div>
                  <select
                    value={drawerSelectedDriverId}
                    onChange={(e) => setDrawerSelectedDriverId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(71,85,105,0.28)",
                      background: "rgba(5,10,24,0.7)",
                      color: "#f8fafc",
                      marginTop: 8,
                    }}
                  >
                    <option value="">Select available driver</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} {driver.vehicleType ? `• ${driver.vehicleType}` : ""} {driver.currentLoad != null ? `• Load ${driver.currentLoad}` : ""}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={applyDrawerManualDriver}
                    style={{ ...buttonStyle("amber"), width: "100%", marginTop: 10 }}
                    disabled={drawerBusy || !drawerSelectedDriverId}
                  >
                    {drawerBusy ? "Applying..." : "Apply Selected Driver"}
                  </button>
                </div>

                <div style={drawerInnerCardStyle}>
                  <div style={statusLabelStyle}>Next Actions</div>
                  <ul style={{ color: "#f8fafc", fontSize: 15, marginTop: 6, paddingLeft: 20 }}>
                    {workflowDrawer.nextActions.length > 0 ? (
                      workflowDrawer.nextActions.map((action, i) => <li key={i}>{action}</li>)
                    ) : (
                      <li>No immediate actions.</li>
                    )}
                  </ul>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={repairDrawerSync} style={buttonStyle("green")} disabled={drawerBusy}>
                    {drawerBusy ? "Repairing..." : "Repair Sync"}
                  </button>
                  <button onClick={refreshWorkflowDrawer} style={buttonStyle("blue")} disabled={drawerBusy}>
                    {drawerBusy ? "Refreshing..." : "Refresh Workflow"}
                  </button>
                </div>

                {drawerMessage ? (
                  <div
                    style={{
                      background: "rgba(239,68,68,0.14)",
                      border: "1px solid rgba(239,68,68,0.28)",
                      borderRadius: 14,
                      padding: 12,
                      color: "#fca5a5",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {drawerMessage}
                  </div>
                ) : null}
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
