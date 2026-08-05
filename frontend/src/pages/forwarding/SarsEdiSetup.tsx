import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, Send, Save, KeyRound } from "lucide-react";
import * as fwd from "../../api/forwardingApi";
import { useToast } from "../../components/ToastProvider";

const PATHS: { id: fwd.CustomsEdiPath; label: string; blurb: string }[] = [
  { id: "CLEARING_AGENT_HANDOFF", label: "Clearing agent", blurb: "We package the SAD500 + docs and email your agent, who lodges with SARS." },
  { id: "SERVICE_PROVIDER", label: "EDI service provider", blurb: "Transmit via a SARS-approved VAN using your provider API key." },
  { id: "DIRECT_EDI", label: "Direct SARS EDI", blurb: "You are a registered SARS EDI user with your own gateway." },
];

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25";

/**
 * Per-tenant SARS transmission setup. FlowOps never holds a platform-wide SARS
 * credential — the tenant brings their own path. Secrets are write-only (masked
 * on read) and encrypted server-side.
 */
export default function SarsEdiSetup() {
  const { showToast } = useToast();
  const [cred, setCred] = useState<fwd.CustomsEdiCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "verify" | null>(null);

  const [path, setPath] = useState<fwd.CustomsEdiPath>("CLEARING_AGENT_HANDOFF");
  const [form, setForm] = useState({ customsClientCode: "", providerName: "", endpointUrl: "", agentEmail: "", secret: "" });

  const load = async () => {
    setLoading(true);
    try {
      const c = await fwd.getEdiCredential();
      setCred(c);
      if (c) {
        setPath(c.path);
        setForm({
          customsClientCode: c.customsClientCode ?? "",
          providerName: c.providerName ?? "",
          endpointUrl: c.endpointUrl ?? "",
          agentEmail: c.agentEmail ?? "",
          secret: "",
        });
      }
    } catch { /* none configured */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    if (path === "CLEARING_AGENT_HANDOFF" && !form.agentEmail.trim()) {
      showToast("A clearing-agent email is required.", "error");
      return;
    }
    setBusy("save");
    try {
      const dto: fwd.UpsertEdiCredential = {
        path,
        customsClientCode: form.customsClientCode || undefined,
        providerName: form.providerName || undefined,
        endpointUrl: form.endpointUrl || undefined,
        agentEmail: form.agentEmail || undefined,
        secret: form.secret || undefined,
      };
      const saved = await fwd.upsertEdiCredential(dto);
      setCred(saved);
      setForm((f) => ({ ...f, secret: "" }));
      showToast("Transmission method saved", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Could not save", "error");
    } finally { setBusy(null); }
  };

  const verify = async () => {
    setBusy("verify");
    try {
      const r = await fwd.verifyEdi();
      showToast(r.ok ? "Connection verified" : (r.reason ?? "Not verified"), r.ok ? "success" : "error");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Verify failed", "error");
    } finally { setBusy(null); }
  };

  const active = PATHS.find((p) => p.id === path) ?? PATHS[0];

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30">
          <KeyRound className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h2 className="text-base font-black text-white">SARS EDI transmission</h2>
          <p className="text-[11px] text-white/40">How this company lodges customs declarations. Your credentials, never ours.</p>
        </div>
        {cred && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            cred.status === "VERIFIED" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
            {cred.status === "VERIFIED" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {cred.status}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : (
        <>
          {/* Path selector */}
          <div className="grid sm:grid-cols-3 gap-2">
            {PATHS.map((p) => (
              <button key={p.id} onClick={() => setPath(p.id)}
                className={`rounded-2xl border p-3 text-left transition ${path === p.id ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/10 bg-black/20 hover:bg-white/5"}`}>
                <div className="text-sm font-bold text-white">{p.label}</div>
                <div className="mt-1 text-[10px] leading-snug text-white/45">{p.blurb}</div>
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="grid sm:grid-cols-2 gap-2">
            <input placeholder="SARS customs client code (CCN)" value={form.customsClientCode}
              onChange={(e) => setForm({ ...form, customsClientCode: e.target.value })} className={inputCls} />
            {path === "CLEARING_AGENT_HANDOFF" && (
              <input placeholder="Clearing agent email" value={form.agentEmail}
                onChange={(e) => setForm({ ...form, agentEmail: e.target.value })} className={inputCls} />
            )}
            {path !== "CLEARING_AGENT_HANDOFF" && (
              <>
                <input placeholder={path === "SERVICE_PROVIDER" ? "Provider name" : "Gateway label"} value={form.providerName}
                  onChange={(e) => setForm({ ...form, providerName: e.target.value })} className={inputCls} />
                <input placeholder="Endpoint / gateway URL" value={form.endpointUrl}
                  onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })} className={inputCls} />
                <input type="password" autoComplete="new-password"
                  placeholder={cred?.hasSecret ? "API key (leave blank to keep current ••••)" : "API key / token"}
                  value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} className={inputCls} />
              </>
            )}
          </div>

          {/* Honest status banner */}
          <div className={`rounded-xl border px-3 py-2 text-[11px] leading-snug ${
            path === "CLEARING_AGENT_HANDOFF" ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200/80" : "border-amber-500/25 bg-amber-500/8 text-amber-200/80"}`}>
            {path === "CLEARING_AGENT_HANDOFF"
              ? "Fully supported today: declarations are packaged and sent to your agent, who lodges with SARS and returns the MRN."
              : "Configurable now, but the live connector is not yet wired — declarations will not be lodged automatically until it is. Use clearing agent in the meantime. Nothing is ever marked “lodged with SARS” without a real acknowledgement."}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy !== null}
              className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-bold text-indigo-200 disabled:opacity-50">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            {cred && (
              <button onClick={verify} disabled={busy !== null}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10 disabled:opacity-50">
                {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Verify connection
              </button>
            )}
            {cred?.lastVerifiedAt && (
              <span className="text-[10px] text-white/30">last checked {new Date(cred.lastVerifiedAt).toLocaleString("en-ZA")}</span>
            )}
          </div>
          <p className="text-[10px] text-white/25">Active method: <span className="text-white/45">{active.label}</span>. Secrets are encrypted server-side and never shown again.</p>
        </>
      )}
    </div>
  );
}
