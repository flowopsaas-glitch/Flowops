import React, { useEffect, useState } from "react";
import { KeyRound, Webhook, Plus, Trash2, Copy, Check, Loader2 } from "lucide-react";
import { api } from "../../api/client";

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

const EVENT_OPTIONS = ["waybill.status_changed"];

export default function Integrations() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/integrations/api-keys").then((r) => setKeys(r.data ?? []));
    api.get("/integrations/webhooks").then((r) => setHooks(r.data ?? []));
  };
  useEffect(load, []);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const r = await api.post("/integrations/api-keys", { name: keyName || "Default key" });
      setNewKey(r.data.key);
      setKeyName("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (id: string) => {
    await api.delete(`/integrations/api-keys/${id}`);
    load();
  };

  const createHook = async () => {
    if (!hookUrl.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/integrations/webhooks", {
        url: hookUrl.trim(),
        events: EVENT_OPTIONS,
      });
      setNewSecret(r.data.secret);
      setHookUrl("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const deleteHook = async (id: string) => {
    await api.delete(`/integrations/webhooks/${id}`);
    load();
  };

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100 p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Integrations</h1>
        <p className="text-sm text-white/50">API keys & webhooks for connecting external systems (Shopify, ERPs, …).</p>
      </div>

      {/* API KEYS */}
      <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} className="text-sky-400" />
          <h2 className="text-lg font-black">API Keys</h2>
        </div>

        <div className="flex gap-2 mb-4">
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
          <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
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
                    {k.prefix}…{k.revokedAt ? " · revoked" : k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  </div>
                </div>
                {!k.revokedAt && (
                  <button onClick={() => revokeKey(k.id)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-white/40 font-mono">
          {`curl -X POST $API/public/v1/waybills -H "X-API-Key: fok_live_…" -H "Content-Type: application/json" -d '{ ... }'`}
        </div>
      </section>

      {/* WEBHOOKS */}
      <section className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Webhook size={18} className="text-sky-400" />
          <h2 className="text-lg font-black">Webhooks</h2>
        </div>

        <div className="flex gap-2 mb-4">
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
          <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 font-black mb-2">
              Signing secret (verify the X-FlowOps-Signature header) — shown once
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
                <button onClick={() => deleteHook(h.id)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
