import React, { useEffect, useState } from "react";
import {
  Activity, Check, CheckCircle2, Copy, Loader2, Plus, RefreshCw,
  Trash2, Webhook, KeyRound, AlertTriangle, Clock, XCircle, ShoppingBag,
} from "lucide-react";
import { api } from "../../api/client";

type ApiKey = {
  id: string; name: string; prefix: string;
  lastUsedAt: string | null; revokedAt: string | null; createdAt: string;
};

type WebhookEndpoint = {
  id: string; url: string; events: string[];
  active: boolean; createdAt: string;
};

type DeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "RETRYING" | "EXHAUSTED";

type WebhookDelivery = {
  id: string; event: string; status: DeliveryStatus;
  responseStatus: number | null; responseBody: string | null;
  attempts: number; createdAt: string;
  endpoint: { id: string; url: string };
};

const EVENT_OPTIONS = ["waybill.status_changed"];

function unwrapList(raw: any): any[] {
  const d = raw?.data ?? raw;
  return Array.isArray(d) ? d : [];
}

const DELIVERY_STATUS_CFG: Record<DeliveryStatus, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING:   { cls: "border-white/10 bg-white/5 text-white/50",              icon: Clock },
  DELIVERED: { cls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", icon: CheckCircle2 },
  FAILED:    { cls: "border-rose-400/20 bg-rose-500/10 text-rose-200",       icon: XCircle },
  RETRYING:  { cls: "border-amber-400/20 bg-amber-500/10 text-amber-200",    icon: RefreshCw },
  EXHAUSTED: { cls: "border-rose-600/30 bg-rose-700/10 text-rose-300",       icon: AlertTriangle },
};

type Tab = "keys" | "webhooks" | "log" | "stores";

export default function Integrations() {
  const [tab, setTab] = useState<Tab>("keys");
  const [keys, setKeys]     = useState<ApiKey[]>([]);
  const [hooks, setHooks]   = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);

  const [keyName, setKeyName]     = useState("");
  const [newKey, setNewKey]       = useState<string | null>(null);
  const [hookUrl, setHookUrl]     = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied]       = useState<string | null>(null);
  const [busy, setBusy]           = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  const loadKeys  = () => api.get("/integrations/api-keys").then((r: any)  => setKeys(unwrapList(r)));
  const loadHooks = () => api.get("/integrations/webhooks").then((r: any) => setHooks(unwrapList(r)));
  const loadLog   = async () => {
    setLoadingLog(true);
    try {
      const r: any = await api.get("/integrations/webhooks/deliveries");
      setDeliveries(unwrapList(r));
    } finally { setLoadingLog(false); }
  };

  useEffect(() => {
    void loadKeys();
    void loadHooks();
  }, []);

  useEffect(() => {
    if (tab === "log") void loadLog();
  }, [tab]);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const r: any = await api.post("/integrations/api-keys", { name: keyName || "Default key" });
      const payload = r?.data ?? r;
      setNewKey(payload.key);
      setKeyName("");
      void loadKeys();
    } finally { setBusy(false); }
  };

  const revokeKey = async (id: string) => {
    await api.delete(`/integrations/api-keys/${id}`);
    void loadKeys();
  };

  const createHook = async () => {
    if (!hookUrl.trim()) return;
    setBusy(true);
    try {
      const r: any = await api.post("/integrations/webhooks", { url: hookUrl.trim(), events: EVENT_OPTIONS });
      const payload = r?.data ?? r;
      setNewSecret(payload.secret);
      setHookUrl("");
      void loadHooks();
    } finally { setBusy(false); }
  };

  const deleteHook = async (id: string) => {
    await api.delete(`/integrations/webhooks/${id}`);
    void loadHooks();
  };

  // Delivery log stats
  const logStats = {
    total:   deliveries.length,
    ok:      deliveries.filter((d) => d.status === "DELIVERED").length,
    failed:  deliveries.filter((d) => d.status === "FAILED" || d.status === "EXHAUSTED").length,
    pending: deliveries.filter((d) => d.status === "PENDING" || d.status === "RETRYING").length,
  };
  const successRate = logStats.total > 0 ? Math.round((logStats.ok / logStats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100 p-8 space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7">
        <h1 className="text-3xl font-black tracking-tight">Integrations</h1>
        <p className="text-sm text-white/50 mt-1">API keys, webhooks, and delivery history for connecting external systems.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 w-fit">
        {([
          { k: "keys",    label: "API Keys",      icon: KeyRound },
          { k: "webhooks",label: "Webhooks",       icon: Webhook },
          { k: "log",     label: `Delivery Log${logStats.failed > 0 ? ` (${logStats.failed} failed)` : ""}`, icon: Activity },
          { k: "stores",  label: "Stores",         icon: ShoppingBag },
        ] as const).map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => setTab(k as Tab)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              tab === k ? "bg-white/15 text-white border border-white/20" : "text-white/50 hover:text-white"
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── API KEYS ── */}
      {tab === "keys" && (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 space-y-5">
          <div className="flex gap-2">
            <input value={keyName} onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (e.g. Shopify)"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-sky-400/40" />
            <button onClick={createKey} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 text-slate-950 px-4 py-2.5 text-sm font-black disabled:opacity-50">
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
            ) : keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div>
                  <div className="text-sm font-bold">{k.name}</div>
                  <div className="text-[11px] text-white/40 font-mono">
                    {k.prefix}…{k.revokedAt ? " · revoked" : k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  </div>
                </div>
                {!k.revokedAt && (
                  <button onClick={() => revokeKey(k.id)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-white/40 font-mono">
            {`curl -X POST $API/public/v1/waybills -H "X-API-Key: fok_live_…" -H "Content-Type: application/json" -d '{ ... }'`}
          </div>
        </section>
      )}

      {/* ── WEBHOOKS ── */}
      {tab === "webhooks" && (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 space-y-5">
          <div className="flex gap-2">
            <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)}
              placeholder="https://your-system.com/flowops/webhook"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-sky-400/40" />
            <button onClick={createHook} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 text-slate-950 px-4 py-2.5 text-sm font-black disabled:opacity-50">
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
            ) : hooks.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <div className="text-sm font-mono truncate">{h.url}</div>
                  <div className="text-[11px] text-white/40">{h.events.join(", ")}</div>
                </div>
                <button onClick={() => deleteHook(h.id)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 ml-3 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── DELIVERY LOG ── */}
      {tab === "log" && (
        <section className="space-y-5">
          {/* Stats strip */}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Total",    val: logStats.total,   tone: "text-white" },
              { label: "Success",  val: logStats.ok,      tone: "text-emerald-300" },
              { label: "Failed",   val: logStats.failed,  tone: "text-rose-300" },
              { label: "Success Rate", val: `${successRate}%`, tone: successRate >= 95 ? "text-emerald-300" : successRate >= 75 ? "text-amber-300" : "text-rose-300" },
            ].map(({ label, val, tone }) => (
              <div key={label} className="rounded-[20px] border border-white/10 bg-slate-900/50 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</div>
                <div className={`mt-2 text-2xl font-black ${tone}`}>{val}</div>
              </div>
            ))}
          </div>

          {/* Success rate bar */}
          {logStats.total > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3">
              <span className="text-xs font-bold text-white/50 whitespace-nowrap">Delivery health</span>
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${successRate >= 95 ? "bg-emerald-400" : successRate >= 75 ? "bg-amber-400" : "bg-rose-400"}`}
                  style={{ width: `${successRate}%` }} />
              </div>
              <span className="text-sm font-black text-white">{successRate}%</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-white/50">{deliveries.length} recent deliveries</div>
            <button onClick={loadLog} disabled={loadingLog}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/60 hover:text-white disabled:opacity-40">
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLog ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-slate-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-white/40">
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Event</th>
                    <th className="px-5 py-3">Endpoint</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">HTTP</th>
                    <th className="px-5 py-3">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLog ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-white/5">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-5 py-3"><div className="h-3 animate-pulse rounded-full bg-white/5" /></td>
                        ))}
                      </tr>
                    ))
                  ) : deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Activity className="mx-auto h-8 w-8 text-white/10 mb-2" />
                        <div className="text-white/30 font-bold text-sm">No delivery history yet.</div>
                        <div className="text-white/20 text-xs mt-1">Deliveries appear here once a waybill status change fires.</div>
                      </td>
                    </tr>
                  ) : deliveries.map((d) => {
                    const cfg = DELIVERY_STATUS_CFG[d.status] ?? DELIVERY_STATUS_CFG.FAILED;
                    const Icon = cfg.icon;
                    return (
                      <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 text-xs text-slate-400">
                          {new Date(d.createdAt).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-sky-300">{d.event}</span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-400 max-w-[180px] truncate font-mono">
                          {d.endpoint.url}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
                            <Icon className="h-3 w-3" /> {d.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {d.responseStatus ? (
                            <span className={`text-xs font-bold ${d.responseStatus >= 200 && d.responseStatus < 300 ? "text-emerald-300" : "text-rose-300"}`}>
                              {d.responseStatus}
                            </span>
                          ) : <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">{d.attempts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── STORES (Shopify / WooCommerce) ── */}
      {tab === "stores" && <StoresTab />}
    </div>
  );
}

// ── Stores Tab ────────────────────────────────────────────────────────────────

function StoreCard({
  logo, name, color, webhookPath, secretEnvHint, docUrl,
}: {
  logo: string; name: string; color: string;
  webhookPath: string; secretEnvHint: string; docUrl: string;
}) {
  const base = (window as any).__VITE_API_BASE__ ?? window.location.origin;
  const endpoint = `${base}/api/v1${webhookPath}`;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`text-2xl font-black ${color}`}>{logo}</div>
        <div>
          <div className="font-black text-white text-lg">{name}</div>
          <a href={docUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
            Setup guide →
          </a>
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50 mb-1.5">
          Webhook Endpoint URL
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
          <code className="flex-1 text-xs text-sky-200 break-all">{endpoint}</code>
          <button onClick={copy} className="shrink-0 rounded-lg bg-white/10 p-1.5 text-white/60 hover:text-white">
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-200/80 leading-relaxed">
        <span className="font-bold">Secret env var: </span>
        <code className="font-mono">{secretEnvHint}</code>
        <br />
        Set this to the webhook secret from your {name} admin. Every inbound order will become a FlowOps waybill automatically.
      </div>
    </div>
  );
}

function StoresTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingBag size={18} className="text-sky-400" />
          <h2 className="text-lg font-black">E-commerce Store Connections</h2>
        </div>
        <p className="text-sm text-white/50">
          Connect your Shopify or WooCommerce store to automatically create waybills
          whenever an order is placed. No polling — FlowOps receives a signed webhook
          from your store the instant an order comes in.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <StoreCard
          logo="🛍"
          name="Shopify"
          color="text-emerald-400"
          webhookPath="/ecommerce/shopify/webhook"
          secretEnvHint={`SHOPIFY_SECRET_<YOUR_COMPANY_ID>`}
          docUrl="https://shopify.dev/docs/apps/build/webhooks/configure/https"
        />
        <StoreCard
          logo="🛒"
          name="WooCommerce"
          color="text-purple-400"
          webhookPath="/ecommerce/woocommerce/webhook"
          secretEnvHint={`WC_SECRET_<YOUR_COMPANY_ID>`}
          docUrl="https://woo.com/document/webhooks/"
        />
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/40 space-y-1">
        <div className="font-bold text-white/60">How it works</div>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Copy the webhook endpoint URL above into your store's webhook settings.</li>
          <li>Set the secret as an environment variable on your backend server.</li>
          <li>Also set <code className="font-mono">SHOPIFY_DOMAIN_&lt;id&gt;</code> or <code className="font-mono">WC_SOURCE_&lt;id&gt;</code> to link your store to your company.</li>
          <li>Every new order will instantly create a FlowOps waybill with the recipient details.</li>
        </ol>
      </div>
    </div>
  );
}

