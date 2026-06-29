import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import { exportCsv, csvFilename } from "../lib/exportCsv";

// ── Types ─────────────────────────────────────────────────────────────────

type ShipmentStatus = "PENDING" | "IN_TRANSIT" | "DELIVERED" | "FAILED";

type Shipment = {
  id: string;
  status: ShipmentStatus;
  currentLat?: number | null;
  currentLng?: number | null;
  estimatedDelivery?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  waybill?: {
    trackingNumber: string;
    recipientName?: string | null;
    recipientAddress?: string | null;
    status?: string;
  } | null;
  driver?: {
    name: string;
    phone?: string | null;
    vehicleType?: string | null;
  } | null;
};

// ── Status config ──────────────────────────────────────────────────────────

const STATUS: Record<
  ShipmentStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode; dot: string }
> = {
  PENDING: {
    label: "Pending",
    color: "text-amber-300",
    bg: "border-amber-400/20 bg-amber-500/10",
    icon: <Clock className="h-3.5 w-3.5" />,
    dot: "bg-amber-400",
  },
  IN_TRANSIT: {
    label: "In Transit",
    color: "text-cyan-300",
    bg: "border-cyan-400/20 bg-cyan-500/10",
    icon: <Truck className="h-3.5 w-3.5" />,
    dot: "bg-cyan-400 animate-pulse",
  },
  DELIVERED: {
    label: "Delivered",
    color: "text-emerald-300",
    bg: "border-emerald-400/20 bg-emerald-500/10",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    dot: "bg-emerald-400",
  },
  FAILED: {
    label: "Failed",
    color: "text-rose-300",
    bg: "border-rose-400/20 bg-rose-500/10",
    icon: <XCircle className="h-3.5 w-3.5" />,
    dot: "bg-rose-400",
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status as ShipmentStatus] ?? STATUS.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${s.bg} ${s.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.icon}
      {s.label}
    </span>
  );
}

// ── ETA helper ─────────────────────────────────────────────────────────────

function formatEta(ts?: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "Overdue";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return d.toLocaleDateString("en-ZA");
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useSearchParams();
  const activeStatusFilter = (statusFilter.get("status") || "").toUpperCase() as ShipmentStatus | "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get("/shipments");
      const data = res?.data ?? res;
      setShipments(Array.isArray(data) ? data : []);
    } catch {
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Auto-refresh every 30 s (live dispatch environment)
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const stats = useMemo(() => {
    const s = shipments;
    return {
      total: s.length,
      pending: s.filter((x) => x.status === "PENDING").length,
      inTransit: s.filter((x) => x.status === "IN_TRANSIT").length,
      delivered: s.filter((x) => x.status === "DELIVERED").length,
      failed: s.filter((x) => x.status === "FAILED").length,
    };
  }, [shipments]);

  const visible = useMemo(() => {
    let list = shipments;
    if (activeStatusFilter) list = list.filter((s) => s.status === activeStatusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.waybill?.trackingNumber?.toLowerCase().includes(q) ||
          s.waybill?.recipientName?.toLowerCase().includes(q) ||
          s.driver?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [shipments, activeStatusFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl fx-glass fx-reveal">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-400">
              Operations Console
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
              Shipments
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Live shipment tracking across all active routes. Auto-refreshes every 30s.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeStatusFilter && (
              <button
                onClick={() => statusFilter.delete("status")}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold text-blue-300 hover:bg-blue-500/20"
              >
                {activeStatusFilter}
                <XCircle className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              onClick={() => exportCsv(
                visible.map((s: Shipment) => ({
                  tracking:  s.waybill?.trackingNumber ?? s.id,
                  status:    s.status,
                  recipient: s.waybill?.recipientName  ?? "",
                  address:   s.waybill?.recipientAddress ?? "",
                  driver:    s.driver?.name             ?? "",
                  eta:       s.estimatedDelivery
                    ? new Date(s.estimatedDelivery).toLocaleDateString("en-ZA")
                    : "",
                  gps:       (s.currentLat && s.currentLng)
                    ? `${s.currentLat},${s.currentLng}`
                    : "",
                  created:   s.createdAt,
                })),
                csvFilename("shipments"),
                [
                  { key: "tracking",  label: "Tracking #"      },
                  { key: "status",    label: "Status"          },
                  { key: "recipient", label: "Recipient"       },
                  { key: "address",   label: "Delivery Address"},
                  { key: "driver",    label: "Driver"          },
                  { key: "eta",       label: "ETA"             },
                  { key: "gps",       label: "GPS Coords"      },
                  { key: "created",   label: "Created"         },
                ]
              )}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { key: "inTransit", label: "In Transit", icon: <Truck className="h-5 w-5" />, tone: "text-cyan-300" },
            { key: "pending", label: "Pending", icon: <Clock className="h-5 w-5" />, tone: "text-amber-300" },
            { key: "delivered", label: "Delivered", icon: <CheckCircle2 className="h-5 w-5" />, tone: "text-emerald-300" },
            { key: "failed", label: "Failed", icon: <AlertCircle className="h-5 w-5" />, tone: "text-rose-300" },
          ] as const
        ).map(({ key, label, icon, tone }, i) => (
          <button
            key={key}
            onClick={() =>
              statusFilter.set(
                "status",
                key === "inTransit" ? "IN_TRANSIT" : key.toUpperCase()
              )
            }
            className={`rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-left shadow-xl fx-lift fx-reveal fx-reveal-${i + 1} transition-colors hover:bg-white/[0.08] ${
              activeStatusFilter ===
              (key === "inTransit" ? "IN_TRANSIT" : key.toUpperCase())
                ? "ring-2 ring-blue-400/40"
                : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">
                {label}
              </div>
              <div className={tone}>{icon}</div>
            </div>
            <div className={`mt-2 text-3xl font-black ${tone}`}>
              {stats[key as keyof typeof stats]}
            </div>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl fx-glass fx-reveal">
        {/* Search */}
        <div className="border-b border-white/10 p-4 flex items-center gap-3">
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tracking number, recipient, driver…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
          <span className="text-xs text-slate-500">
            {visible.length} of {shipments.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/40">
                <th className="px-5 py-3">Tracking</th>
                <th className="px-5 py-3">Recipient</th>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">ETA</th>
                <th className="px-5 py-3">GPS</th>
                <th className="px-5 py-3 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 animate-pulse rounded-full bg-white/5" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Package className="mx-auto h-10 w-10 text-white/10 mb-3" />
                    <div className="text-white/40 font-bold">
                      {shipments.length === 0
                        ? "No shipments yet — create a waybill and assign a driver to see live tracking here."
                        : "No shipments match your filters."}
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Tracking */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl border border-cyan-500/20 bg-cyan-500/10 grid place-items-center">
                          <Activity className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div>
                          <div className="font-bold text-white">
                            {s.waybill?.trackingNumber ?? s.id.slice(0, 8)}
                          </div>
                          <div className="text-[10px] font-mono text-white/30">{s.id.slice(0, 10)}…</div>
                        </div>
                      </div>
                    </td>

                    {/* Recipient */}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">
                        {s.waybill?.recipientName ?? "—"}
                      </div>
                      {s.waybill?.recipientAddress && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[180px]">{s.waybill.recipientAddress}</span>
                        </div>
                      )}
                    </td>

                    {/* Driver */}
                    <td className="px-5 py-4">
                      {s.driver ? (
                        <div>
                          <div className="font-semibold text-white">{s.driver.name}</div>
                          <div className="text-[11px] text-slate-400">{s.driver.vehicleType ?? s.driver.phone}</div>
                        </div>
                      ) : (
                        <span className="text-white/30 text-xs">Unassigned</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <StatusBadge status={s.status} />
                    </td>

                    {/* ETA */}
                    <td className="px-5 py-4">
                      <span
                        className={`text-sm font-bold ${
                          s.estimatedDelivery &&
                          new Date(s.estimatedDelivery) < new Date() &&
                          s.status !== "DELIVERED"
                            ? "text-rose-400"
                            : "text-slate-300"
                        }`}
                      >
                        {s.status === "DELIVERED"
                          ? s.deliveredAt
                            ? new Date(s.deliveredAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
                            : "Delivered"
                          : formatEta(s.estimatedDelivery)}
                      </span>
                    </td>

                    {/* GPS */}
                    <td className="px-5 py-4">
                      {s.currentLat && s.currentLng ? (
                        <a
                          href={`https://maps.google.com/?q=${s.currentLat},${s.currentLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <MapPin className="h-3 w-3" /> Live
                        </a>
                      ) : (
                        <span className="text-white/20 text-xs">No GPS</span>
                      )}
                    </td>

                    {/* Updated */}
                    <td className="px-5 py-4 text-right text-xs text-slate-400">
                      {new Date(s.updatedAt).toLocaleString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
