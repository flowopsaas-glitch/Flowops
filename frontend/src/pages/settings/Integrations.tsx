import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { api } from "../../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type WebhookEndpoint = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

type WebhookDelivery = {
  id: string;
  event: string;
  status: "PENDING" | "DELIVERED" | "RETRYING" | "EXHAUSTED" | "FAILED";
  attempts: number;
  maxAttempts: number;
  responseStatus: number | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  endpoint: { url: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  DELIVERED:  "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  RETRYING:   "border-amber-400/20 bg-amber-500/10 text-amber-200",
  EXHAUSTED:  "border-rose-400/20 bg-rose-500/10 text-rose-200",
  PENDING:    "border-slate-400/20 bg-slate-500/10 text-slate-300",
  FAILED:     "border-rose-400/20 bg-rose-500/10 text-rose-200",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  DELIVERED: <CheckCircle2 size={12} />,
  RETRYING:  <Clock size={12} />,
  EXHAUSTED: <XCircle size={12} />,
  PENDING:   <Clock size={12} />,
  FAILED:    <XCircle size={12} />,
};

function unwrap(res: any) {
  return res?.data ?? res;
}

const EVENT_OPTIONS = ["waybill.status_changed"];

// ── Tab component ──────────────────────────────────────────────────────────

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
        active
          ? "bg-sky-500/20 text-sky-300 border border-sky-400/30"
          : "border border-transparent text-white/50 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Integrations() {
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks" | "log">("keys");

  // API key state
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  // Webhook endpoint state
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Delivery log state
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Shared
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────

  const loadEndpoints = useCallback(() => {
    api.get("/integrations/api-keys").then((r) => setKeys(unwrap(r) ?? []));
    api.get("/integrations/webhooks").then((r) => setHooks(unwrap(r) ?? []));
  }, []);

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    try {
      const r = await api.get("/integrations/webhooks/deliveries?limit=200");
      const data = unwrap(r);
      setDeliveries(Array.isArray(data) ? data : []);
    } finally {
      setDeliveriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEndpoints();
  }, [loadEndpoints]);

  useEffect(() => {
    if (activeTab === "log") void loadDeliveries();
  }, [activeTab, loadDeliveries]);

  // ── Actions ───────────────────────────────────────────────────────────

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const r = await api.post("/integrations/api-keys", {
        name: keyName || "Default key",
      });
      setNewKey(unwrap(r)?.key);
      setKeyName("");
      loadEndpoints();
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (id: string) => {
    await api.delete(`/integrations/api-keys/${id}`);
    loadEndpoints();
  };

  const createHook = async () => {
    if (!hookUrl.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/integrations/webhooks", {
        url: hookUrl.trim(),
        events: EVENT_OPTIONS,
      });
      setNewSecret(unwrap(r)?.secret);
      setHookUrl("");
      loadEndpoints();
    } finally {
      setBusy(false);
    }
  };

  const deleteHook = async (id: string) => {
    await api.delete(`/integrations/webhooks/${id}`);
    loadEndpoints();
  };

  const retryDelivery = async (id: string) => {
    setRetryingId(id);
    try {
      await api.post(`/integrations/webhooks/deliveries/${id}/retry`, {});
      await loadDeliveries();
    } finally {
      setRetryingId(null);
    }
  };

  // ── Derived delivery stats ────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === "DELIVERED").length;
    const retrying  = deliveries.filter((d) => d.status === "RETRYING").length;
    const exhausted = deliveries.filter((d) => d.status === "EXHAUSTED").length;
    const rate = total ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, retrying, exhausted, rate };
  }, [deliveries]);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return deliveries;
    return deliveries.filter((d) => d.status === statusFilter);
  }, [deliveries, statusFilter]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100 p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight">Integrations</h1>
        <p className="text-sm text-white/50 mt-1">
          API keys, webhooks &amp; delivery monitoring for connecting external
          systems (Shopify, ERPs, …).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Tab active={activeTab === "keys"} onClick={() => setActiveTab("keys")}>
          <span className="flex items-center gap-1.5">
            <KeyRound size={14} /> API Keys ({keys.length})
          </span>
        </Tab>
        <Tab active={activeTab === "webhooks"} onClick={() => setActiveTab("webhooks")}>
          <span className="flex items-center gap-1.5">
            <Webhook size={14} /> Webhooks ({hooks.length})
          </span>
        </Tab>
        <Tab active={activeTab === "log"} onClick={() => setActiveTab("log")}>
          <span className="flex items-center gap-1.5">
            <Activity size={14} /> Delivery Log
            {stats.exhausted > 0 && (
              <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.5 text-[10px] font-black leading-none">
                {stats.exhausted}
              </span>
            )}
            {stats.retrying > 0 && stats.exhausted === 0 && (
              <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[10px] font-black leading-none">
                {stats.retrying}
              </span>
            )}
          </span>
        </Tab>
      </div>

      {/* ── API KEYS tab ───────────────────────────────────────────────── */}
      {activeTab === "keys" && (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-sky-400" />
            <h2 className="text-lg font-black">API Keys</h2>
          </div>

          <div className="flex gap-2">
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (e.g. Shopify)"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-sky-400/40"
            />
            <button
              onClick={createKey}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 text-slate-950 px-4 py-2.5 text-sm font-black disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create
            </button>
          </div>

          {newKey && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 font-black mb-2">
                Copy your key now — it won't be shown again
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-sm text-emerald-200">{newKey}</code>
                <button onClick={() => copy(newKey, "newkey")} className="rounded-lg bg-white/10 p-2">
                  {copied === "newkey" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {keys.length === 0 ? (
              <div className="text-white/40 text-sm py-4">No API keys yet.</div>
            ) : (
              keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <div>
                    <div className="text-sm font-bold">{k.name}</div>
                    <div className="text-[11px] text-white/40 font-mono">
                      {k.prefix}…
                      {k.revokedAt
                        ? " · revoked"
                        : k.lastUsedAt
                          ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString("en-ZA")}`
                          : " · never used"}
                    </div>
                  </div>
                  {!k.revokedAt && (
                    <button
                      onClick={() => revokeKey(k.id)}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-white/40 font-mono">
            {`curl -X POST $API/public/v1/waybills -H "X-API-Key: fok_live_…" -H "Content-Type: application/json" -d '{ ... }'`}
          </div>
        </section>
      )}

      {/* ── WEBHOOKS tab ──────────────────────────────────────────────── */}
      {activeTab === "webhooks" && (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Webhook size={18} className="text-sky-400" />
            <h2 className="text-lg font-black">Webhook Endpoints</h2>
          </div>
          <p className="text-sm text-white/50">
            FlowOps signs every delivery with{" "}
            <code className="text-sky-300">X-FlowOps-Signature: sha256=…</code>.
            Failed deliveries retry automatically up to 5×
            (0 s → 1 min → 5 min → 30 min → 2 h).
          </p>

          <div className="flex gap-2">
            <input
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              placeholder="https://your-system.com/flowops/webhook"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-sky-400/40"
            />
            <button
              onClick={createHook}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 text-slate-950 px-4 py-2.5 text-sm font-black disabled:opacity-50"
            >
              <Plus size={16} /> Add
            </button>
          </div>

          {newSecret && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 font-black mb-2">
                Signing secret (verify X-FlowOps-Signature) — shown once
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-sm text-emerald-200">{newSecret}</code>
                <button onClick={() => copy(newSecret, "secret")} className="rounded-lg bg-white/10 p-2">
                  {copied === "secret" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {hooks.length === 0 ? (
              <div className="text-white/40 text-sm py-4">No webhook endpoints yet.</div>
            ) : (
              hooks.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-mono truncate">{h.url}</div>
                    <div className="text-[11px] text-white/40">{h.events.join(", ")}</div>
                  </div>
                  <button
                    onClick={() => deleteHook(h.id)}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── DELIVERY LOG tab ──────────────────────────────────────────── */}
      {activeTab === "log" && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total deliveries", value: stats.total, tone: "text-white" },
              { label: "Delivered", value: stats.delivered, tone: "text-emerald-300" },
              { label: "Retrying", value: stats.retrying, tone: "text-amber-300" },
              { label: "Exhausted", value: stats.exhausted, tone: "text-rose-300" },
            ].map(({ label, value, tone }) => (
              <div key={label} className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</div>
                <div className={`mt-1.5 text-3xl font-black ${tone}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Success rate */}
          {stats.total > 0 && (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-white">Delivery success rate</div>
                <div className="text-sm font-black text-white">{stats.rate}%</div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${stats.rate}%` }}
                />
              </div>
            </div>
          )}

          {/* Filter + refresh */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {["ALL", "DELIVERED", "RETRYING", "EXHAUSTED"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-black uppercase transition-colors ${
                    statusFilter === s
                      ? "bg-sky-500/20 text-sky-300 border border-sky-400/30"
                      : "border border-white/10 text-white/50 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={loadDeliveries}
              disabled={deliveriesLoading}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-60"
            >
              <RefreshCw size={12} className={deliveriesLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Delivery table */}
          <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
            {deliveriesLoading ? (
              <div className="flex items-center justify-center py-10 text-white/40 gap-2">
                <Loader2 size={18} className="animate-spin" /> Loading deliveries…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-white/40 text-sm">
                {deliveries.length === 0
                  ? "No webhook deliveries yet. Deliveries appear when events are dispatched."
                  : `No ${statusFilter.toLowerCase()} deliveries.`}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/40">
                      <th className="px-3 py-3">When</th>
                      <th className="px-3 py-3">Event</th>
                      <th className="px-3 py-3">Endpoint</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Attempts</th>
                      <th className="px-3 py-3">Response</th>
                      <th className="px-3 py-3">Next retry</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {new Date(d.createdAt).toLocaleString("en-ZA")}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-300">{d.event}</td>
                        <td className="px-3 py-3 max-w-[180px]">
                          <div className="truncate text-xs text-slate-400">
                            {d.endpoint?.url ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                              STATUS_STYLE[d.status] ?? STATUS_STYLE.PENDING
                            }`}
                          >
                            {STATUS_ICON[d.status]}
                            {d.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-300 text-xs tabular-nums">
                          {d.attempts}/{d.maxAttempts}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {d.responseStatus ? (
                            <span
                              className={
                                d.responseStatus >= 200 && d.responseStatus < 300
                                  ? "text-emerald-300"
                                  : "text-rose-300"
                              }
                            >
                              {d.responseStatus}
                            </span>
                          ) : d.errorMessage ? (
                            <span className="text-rose-300 truncate max-w-[120px] block" title={d.errorMessage}>
                              {d.errorMessage.slice(0, 40)}…
                            </span>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {d.nextRetryAt
                            ? new Date(d.nextRetryAt).toLocaleTimeString("en-ZA")
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {(d.status === "EXHAUSTED" || d.status === "RETRYING" || d.status === "FAILED") && (
                            <button
                              disabled={retryingId === d.id}
                              onClick={() => retryDelivery(d.id)}
                              title="Retry now"
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-60"
                            >
                              {retryingId === d.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <RotateCcw size={11} />
                              )}
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
