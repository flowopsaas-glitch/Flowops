import React, { useEffect, useState } from "react";
import {
  Activity, Check, CheckCircle2, Copy, Loader2, Plus, RefreshCw,
  Trash2, Webhook, KeyRound, AlertTriangle, Clock, XCircle, ShoppingBag,
  MessageCircle, ShieldCheck, Save,
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

type Tab = "keys" | "webhooks" | "log" | "stores" | "whatsapp";

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
          { k: "whatsapp",label: "WhatsApp",       icon: MessageCircle },
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

      {/* ── WHATSAPP ── */}
      {tab === "whatsapp" && <WhatsAppTab />}

      {/* ── STORES (Shopify / WooCommerce) ── */}
      {tab === "stores" && <StoresTab />}
    </div>
  );
}

// ── Connection credential form (shared by WhatsApp + Stores) ────────────────

type FieldDef = {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

type MaskedConnection = {
  provider: string;
  connected: boolean;
  status: string;
  config: Record<string, string | null>;
  secretsSet: Record<string, boolean>;
  lastVerifiedAt: string | null;
};

function ConnectionForm({
  provider,
  fields,
  webhookPath,
  cta = "Save connection",
  fixedValues,
}: {
  provider: string;
  fields: FieldDef[];
  webhookPath?: string;
  cta?: string;
  fixedValues?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [conn, setConn] = useState<MaskedConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const base = (window as any).__VITE_API_BASE__ ?? window.location.origin;
  const endpoint = webhookPath ? `${base}/api/v1${webhookPath}` : null;

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await api.get(`/integrations/connections/${provider}`);
      const c = (r?.data ?? r) as MaskedConnection;
      setConn(c);
      const seed: Record<string, string> = {};
      for (const f of fields) {
        if (!f.secret && c?.config?.[f.key]) seed[f.key] = String(c.config[f.key]);
      }
      setValues(seed);
    } catch {
      setMsg({ kind: "err", text: "Could not load this connection." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Only send fields the user actually filled in (blank secrets keep stored value).
      const payload: Record<string, string> = { ...(fixedValues ?? {}) };
      for (const f of fields) {
        const v = (values[f.key] ?? "").trim();
        if (v) payload[f.key] = v;
      }
      await api.put(`/integrations/connections/${provider}`, payload);
      setMsg({ kind: "ok", text: "Connection saved." });
      // Clear secret inputs after save; reload masked status.
      setValues((prev) => {
        const next = { ...prev };
        for (const f of fields) if (f.secret) delete next[f.key];
        return next;
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Could not save this connection." });
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    try {
      await api.delete(`/integrations/connections/${provider}`);
      setValues({});
      setMsg({ kind: "ok", text: "Disconnected." });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Could not disconnect." });
    } finally {
      setSaving(false);
    }
  };

  const copyEndpoint = () => {
    if (!endpoint) return;
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Connection</div>
        {conn?.connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-white/40">
            Not connected
          </span>
        )}
      </div>

      {endpoint && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50 mb-1.5">
            Webhook Endpoint URL — paste this into your store
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <code className="flex-1 text-xs text-sky-200 break-all">{endpoint}</code>
            <button onClick={copyEndpoint} className="shrink-0 rounded-lg bg-white/10 p-1.5 text-white/60 hover:text-white">
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/40 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((f) => {
            const isSet = f.secret && conn?.secretsSet?.[f.key];
            return (
              <div key={f.key}>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
                  {f.label}{f.secret && <span className="ml-1 text-white/30">(secret)</span>}
                </label>
                <input
                  type={f.secret ? "password" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={isSet ? "•••••••• (saved — leave blank to keep)" : f.placeholder}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-sky-400/40"
                />
                {f.help && <div className="mt-1 text-[11px] text-white/35">{f.help}</div>}
              </div>
            );
          })}

          {msg && (
            <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              msg.kind === "ok"
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                : "border-rose-400/20 bg-rose-500/10 text-rose-200"
            }`}>
              {msg.text}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 text-slate-950 px-4 py-2.5 text-sm font-black disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {cta}
            </button>
            {conn?.connected && (
              <button onClick={disconnect} disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-300 disabled:opacity-50">
                <Trash2 size={14} /> Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── WhatsApp Tab ────────────────────────────────────────────────────────────

const WA_META_FIELDS: FieldDef[] = [
  { key: "phoneNumberId", label: "Phone number ID", placeholder: "e.g. 123456789012345",
    help: "Meta's ID for your WhatsApp number — also used to route inbound replies to your inbox." },
  { key: "accessToken", label: "Access token", secret: true, placeholder: "EAAG… permanent token",
    help: "A permanent system-user token with whatsapp_business_messaging permission." },
  { key: "businessAccountId", label: "WhatsApp Business Account ID", placeholder: "(optional) for message templates" },
  { key: "webhookVerifyToken", label: "Webhook verify token", secret: true,
    placeholder: "any string you set in Meta → Webhooks",
    help: "Must match the verify token you enter when subscribing the webhook URL above in Meta." },
  { key: "appSecret", label: "App secret", secret: true, placeholder: "Meta app secret",
    help: "Used to verify inbound webhook signatures. Strongly recommended." },
];

const WA_TELESIGN_FIELDS: FieldDef[] = [
  { key: "telesignCustomerId", label: "Telesign Customer ID", placeholder: "FFFFFFFF-EEEE-DDDD-1234-AB1234567890",
    help: "From your Telesign portal (the account Customer ID / SID)." },
  { key: "telesignApiKey", label: "Telesign API key", secret: true, placeholder: "your Telesign API key",
    help: "Used with Basic auth against Telesign's omnichannel endpoint." },
  { key: "telesignSenderId", label: "Sender ID", placeholder: "(optional) approved sender ID" },
  { key: "telesignTemplate", label: "Default WhatsApp template name", placeholder: "(optional) approved template name",
    help: "Telesign requires pre-approved WhatsApp templates for business-initiated messages." },
];

function WhatsAppTab() {
  const [gateway, setGateway] = useState<"meta" | "telesign">("meta");
  const [ready, setReady] = useState(false);

  // Read the saved gateway once so the toggle reflects the current connection.
  useEffect(() => {
    let alive = true;
    api.get("/integrations/connections/whatsapp")
      .then((r: any) => {
        const g = (r?.data ?? r)?.config?.gateway;
        if (alive && (g === "meta" || g === "telesign")) setGateway(g);
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle size={18} className="text-emerald-400" />
          <h2 className="text-lg font-black">WhatsApp Business Connection</h2>
        </div>
        <p className="text-sm text-white/50">
          Connect <span className="text-white/80 font-semibold">your own</span> WhatsApp Business number so your
          team sends and receives from it — no shared platform number. Choose your gateway below.
        </p>

        {/* Gateway selector */}
        <div className="mt-4 inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
          {([
            { k: "meta", label: "Meta Cloud API" },
            { k: "telesign", label: "Telesign" },
          ] as const).map(({ k, label }) => (
            <button key={k} onClick={() => setGateway(k)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                gateway === k ? "bg-white/15 text-white border border-white/20" : "text-white/50 hover:text-white"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {ready && gateway === "meta" && (
        <ConnectionForm
          key="wa-meta"
          provider="whatsapp"
          webhookPath="/whatsapp/webhook"
          cta="Save WhatsApp (Meta)"
          fixedValues={{ gateway: "meta" }}
          fields={WA_META_FIELDS}
        />
      )}

      {ready && gateway === "telesign" && (
        <ConnectionForm
          key="wa-telesign"
          provider="whatsapp"
          cta="Save WhatsApp (Telesign)"
          fixedValues={{ gateway: "telesign" }}
          fields={WA_TELESIGN_FIELDS}
        />
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/45 leading-relaxed">
        <div className="font-bold text-white/60 mb-1 flex items-center gap-1.5"><ShieldCheck size={13} /> Click-to-chat still works without this</div>
        If you don't connect a gateway, the WhatsApp Hub falls back to click-to-chat links from your company
        mobile number (set under Settings → Company). Connecting here unlocks programmatic sending.
        {gateway === "telesign" && (
          <span className="block mt-2 text-amber-200/70">
            Telesign sends via its omnichannel API. Business-initiated WhatsApp messages generally require a
            pre-approved template — set the template name above, and check the delivery log / server logs for
            Telesign's response when validating.
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stores Tab (Shopify / WooCommerce) ──────────────────────────────────────

function StoresTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingBag size={18} className="text-sky-400" />
          <h2 className="text-lg font-black">E-commerce Store Connections</h2>
        </div>
        <p className="text-sm text-white/50">
          Connect your Shopify or WooCommerce store to automatically create waybills whenever an order is
          placed. Paste the webhook URL into your store, then enter the matching webhook secret here — FlowOps
          verifies every inbound order against it.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-black text-emerald-400">🛍</div>
            <div>
              <div className="font-black text-white text-lg">Shopify</div>
              <a href="https://shopify.dev/docs/apps/build/webhooks/configure/https" target="_blank" rel="noreferrer"
                className="text-xs text-sky-400 hover:underline">Setup guide →</a>
            </div>
          </div>
          <ConnectionForm
            provider="shopify"
            webhookPath="/ecommerce/shopify/webhook"
            cta="Save Shopify store"
            fields={[
              { key: "shopDomain", label: "Shop domain", placeholder: "mystore.myshopify.com",
                help: "The x-shopify-shop-domain your store sends — used to match orders to your account." },
              { key: "webhookSecret", label: "Webhook signing secret", secret: true,
                placeholder: "from Shopify → Notifications → Webhooks",
                help: "Required — inbound orders are rejected if the signature doesn't match." },
              { key: "accessToken", label: "Admin API access token", secret: true,
                placeholder: "(optional) shpat_… for delivery status push-back" },
            ]}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-black text-purple-400">🛒</div>
            <div>
              <div className="font-black text-white text-lg">WooCommerce</div>
              <a href="https://woo.com/document/webhooks/" target="_blank" rel="noreferrer"
                className="text-xs text-sky-400 hover:underline">Setup guide →</a>
            </div>
          </div>
          <ConnectionForm
            provider="woocommerce"
            webhookPath="/ecommerce/woocommerce/webhook"
            cta="Save WooCommerce store"
            fields={[
              { key: "sourceUrl", label: "Store URL", placeholder: "https://mystore.com",
                help: "The x-wc-webhook-source your store sends — used to match orders to your account." },
              { key: "webhookSecret", label: "Webhook secret", secret: true,
                placeholder: "from WooCommerce → Webhooks",
                help: "Required — inbound orders are rejected if the signature doesn't match." },
            ]}
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/40 space-y-1">
        <div className="font-bold text-white/60">How it works</div>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Copy the webhook endpoint URL into your store's webhook settings (topic: order created).</li>
          <li>Enter the same webhook secret here so FlowOps can verify each order.</li>
          <li>Enter your shop domain / store URL so inbound orders are matched to your company.</li>
          <li>Every new order instantly creates a FlowOps waybill with the recipient details.</li>
        </ol>
      </div>
    </div>
  );
}

