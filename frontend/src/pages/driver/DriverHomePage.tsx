/**
 * DriverHomePage — the primary landing page for DRIVER-role users.
 *
 * Shows the driver's active work queue (deliveries in progress + pending
 * pickups), quick-action buttons, an offline indicator, and a link to the
 * standalone Driver Portal PWA for POD capture.
 *
 * Deliberately mobile-first — drivers use phones, not wide monitors.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Package,
  RefreshCw,
  Smartphone,
  Truck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/auth-context";

// ── Types ────────────────────────────────────────────────────────────────────

type Waybill = {
  id: string;
  trackingNumber: string;
  status: string;
  recipientName?: string | null;
  recipientAddress?: string | null;
  recipientPhone?: string | null;
  weight?: number | null;
  totalAmount?: number | null;
  createdAt: string;
};

type Collection = {
  id: string;
  status: string;
  clientName?: string | null;
  clientPhone?: string | null;
  pickupAddress?: string | null;
  scheduledAt?: string | null;
  notes?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function unwrap(r: unknown): unknown[] {
  const d = (r as { data?: unknown } | null)?.data ?? r;
  if (Array.isArray(d)) return d;
  if (Array.isArray((d as { data?: unknown } | null)?.data)) return (d as { data: unknown[] }).data;
  return [];
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTIVE_DELIVERY_STATUSES = new Set(["COLLECTED", "IN_TRANSIT", "OUT_FOR_DELIVERY"]);
const ACTIVE_COLLECTION_STATUSES = new Set(["PENDING", "ASSIGNED", "IN_PROGRESS"]);

const STATUS_LABEL: Record<string, string> = {
  COLLECTED: "Collected",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
};

const STATUS_COLOR: Record<string, string> = {
  COLLECTED: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  IN_TRANSIT: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  OUT_FOR_DELIVERY: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  PENDING: "bg-white/8 text-white/50 border-white/15",
  ASSIGNED: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  IN_PROGRESS: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
};

const DRIVER_PORTAL_URL = import.meta.env.VITE_DRIVER_APP_URL ?? "/driver/portal";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        STATUS_COLOR[status] ?? "bg-white/8 text-white/40 border-white/10"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function WaybillCard({ wb }: { wb: Waybill }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-start gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-4 transition hover:border-white/15 hover:bg-white/[0.06] cursor-pointer"
      onClick={() => navigate("/pod-deliveries")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => navigate("/pod-deliveries"))(); } }} role="button" tabIndex={0}
    >
      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
        <Truck className="h-4.5 w-4.5 text-cyan-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-black text-white">{wb.trackingNumber}</span>
          <StatusChip status={wb.status} />
        </div>
        {wb.recipientName && (
          <div className="mt-1 text-xs text-white/60 truncate">{wb.recipientName}</div>
        )}
        {wb.recipientAddress && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/35 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {wb.recipientAddress}
          </div>
        )}
        {wb.recipientPhone && (
          <a
            href={`https://wa.me/${wb.recipientPhone.replace(/\D/g, "")}?text=Hi%2C+I%27m+your+FlowOps+delivery+driver+en+route+with+${wb.trackingNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/8 px-2.5 py-1 text-[10px] font-bold text-green-300 hover:bg-green-500/15 transition"
          >
            <MessageCircle className="h-3 w-3" />
            WhatsApp recipient
          </a>
        )}
      </div>
    </div>
  );
}

function CollectionCard({ col }: { col: Collection }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-start gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-4 transition hover:border-white/15 hover:bg-white/[0.06] cursor-pointer"
      onClick={() => navigate("/collections")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => navigate("/collections"))(); } }} role="button" tabIndex={0}
    >
      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/10">
        <Package className="h-4.5 w-4.5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-black text-white truncate">
            {col.clientName ?? "Pickup Job"}
          </span>
          <StatusChip status={col.status} />
        </div>
        {col.pickupAddress && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-white/35 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {col.pickupAddress}
          </div>
        )}
        {col.scheduledAt && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/30">
            <Clock className="h-3 w-3 shrink-0" />
            {timeAgo(col.scheduledAt)}
          </div>
        )}
        {col.clientPhone && (
          <a
            href={`https://wa.me/${col.clientPhone.replace(/\D/g, "")}?text=Hi%2C+I%27m+your+FlowOps+driver+on+my+way+for+the+pickup.`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/8 px-2.5 py-1 text-[10px] font-bold text-green-300 hover:bg-green-500/15 transition"
          >
            <MessageCircle className="h-3 w-3" />
            WhatsApp client
          </a>
        )}
      </div>
    </div>
  );
}

function EmptyCard({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-white/8 py-10 text-center">
      <Icon className="h-10 w-10 text-white/10" />
      <p className="text-sm text-white/25">{message}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DriverHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  /* Online / offline listener */
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const load = useCallback(() => (async () => {
    try {
      const [wbRes, colRes] = await Promise.allSettled([
        api.get("/waybills"),
        api.get("/collections"),
      ]);
      if (wbRes.status === "fulfilled") {
        setWaybills(
          (unwrap(wbRes.value) as Waybill[]).filter((w) =>
            ACTIVE_DELIVERY_STATUSES.has(w.status)
          )
        );
      }
      if (colRes.status === "fulfilled") {
        setCollections(
          (unwrap(colRes.value) as Collection[]).filter((c) =>
            ACTIVE_COLLECTION_STATUSES.has(c.status)
          )
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  })(), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return load();
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  /* Auto-refresh every 60 s */
  useEffect(() => {
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const totalJobs = useMemo(
    () => waybills.length + collections.length,
    [waybills.length, collections.length]
  );

  const driverInitial = (user?.name ?? user?.email ?? "D").charAt(0).toUpperCase();

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div className="min-h-full p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4 animate-pulse">
          <div className="h-24 rounded-[28px] bg-white/5" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-[20px] bg-white/5" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-[20px] bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="driver-portal-scope min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* ── Header card ── */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            {/* Avatar + greeting */}
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-500/20 ring-2 ring-sky-500/30 text-xl font-black text-sky-300">
                {driverInitial}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                  Driver Portal
                </p>
                <h1 className="text-xl font-black text-white leading-tight">
                  {user?.name ?? "Driver"}
                </h1>
                <p className="text-xs text-white/40 mt-0.5">
                  {totalJobs} active job{totalJobs !== 1 ? "s" : ""} right now
                </p>
              </div>
            </div>

            {/* Online / offline + refresh */}
            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${
                  online
                    ? "bg-emerald-500/12 text-emerald-300 border border-emerald-500/20"
                    : "bg-amber-500/12 text-amber-300 border border-amber-500/20"
                }`}
              >
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? "Online" : "Offline"}
              </span>
              <button
                onClick={() => void refresh()}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3 py-1.5 text-[10px] font-bold text-white/40 hover:bg-white/8 hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Deliveries",  value: waybills.length,    icon: Truck,         color: "text-cyan-300"    },
            { label: "Pickups",     value: collections.length, icon: Package,       color: "text-amber-300"   },
            { label: "Total Jobs",  value: totalJobs,          icon: CheckCircle2,  color: "text-white"       },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
            >
              <Icon className={`h-4 w-4 ${color} opacity-70`} />
              <div className={`text-2xl font-black leading-none ${color}`}>{value}</div>
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Quick actions ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/pod-deliveries")}
            className="flex items-center gap-3 rounded-[22px] border border-cyan-500/25 bg-cyan-500/10 p-4 text-left hover:bg-cyan-500/18 transition shadow-[0_0_24px_rgba(6,182,212,0.08)]"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/20">
              <CheckCircle2 className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="text-sm font-black text-white">Capture POD</div>
              <div className="text-[10px] text-white/40">Signature & photo</div>
            </div>
          </button>

          <button
            onClick={() =>
              DRIVER_PORTAL_URL.startsWith("http")
                ? window.open(DRIVER_PORTAL_URL, "_blank")
                : navigate(DRIVER_PORTAL_URL)
            }
            className="flex items-center gap-3 rounded-[22px] border border-sky-500/25 bg-sky-500/10 p-4 text-left hover:bg-sky-500/18 transition shadow-[0_0_24px_rgba(56,189,248,0.08)]"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/20">
              <Smartphone className="h-5 w-5 text-sky-300" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between">
              <div>
                <div className="text-sm font-black text-white">Driver App</div>
                <div className="text-[10px] text-white/40">Mobile PWA</div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-white/25 shrink-0" />
            </div>
          </button>
        </div>

        {/* ── Active deliveries ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white/60">
              Active Deliveries
            </h2>
            <button
              onClick={() => navigate("/pod-deliveries")}
              className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 transition"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {waybills.length === 0 ? (
            <EmptyCard icon={Truck} message="No active deliveries right now" />
          ) : (
            <div className="space-y-3">
              {waybills.map((wb) => (
                <WaybillCard key={wb.id} wb={wb} />
              ))}
            </div>
          )}
        </section>

        {/* ── Pending pickups ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white/60">
              Pending Pickups
            </h2>
            <button
              onClick={() => navigate("/collections")}
              className="flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {collections.length === 0 ? (
            <EmptyCard icon={Package} message="No pending pickups assigned" />
          ) : (
            <div className="space-y-3">
              {collections.map((col) => (
                <CollectionCard key={col.id} col={col} />
              ))}
            </div>
          )}
        </section>

        {/* ── Offline banner ── */}
        {!online && (
          <div className="flex items-start gap-3 rounded-[20px] border border-amber-500/25 bg-amber-500/8 p-4">
            <WifiOff className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-300">You are offline</p>
              <p className="text-xs text-amber-200/60 mt-1">
                POD captures will be queued locally and synced when you reconnect.
                Open the Driver App to manage your offline queue.
              </p>
            </div>
          </div>
        )}

        {/* ── Tip footer ── */}
        <div className="rounded-[20px] border border-white/5 bg-black/20 p-4 text-[11px] leading-relaxed text-white/30">
          <AlertCircle className="mb-1.5 h-3.5 w-3.5 text-white/20 inline mr-1.5" />
          Tap <strong className="text-white/40">Capture POD</strong> to record
          signatures and photos at delivery. Use <strong className="text-white/40">WhatsApp</strong>{" "}
          buttons to contact clients or dispatch directly.
        </div>

      </div>
    </div>
  );
}
