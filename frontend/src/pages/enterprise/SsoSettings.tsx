import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, CheckCircle2, Copy, Crown, KeyRound, Loader2, Lock, Save, ShieldCheck,
} from "lucide-react";
import {
  getSsoConfig, saveSsoConfig, type SsoConfig, type SsoConfigInput,
} from "../../api/ssoApi";
import { useToast } from "../../components/ToastProvider";

const ROLES = ["AGENT", "DISPATCH", "WAREHOUSE", "MANAGER", "VIEWER", "USER"];

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-violet-500/50 focus:outline-none";
const LABEL = "text-[11px] font-bold uppercase tracking-wider text-white/45 mb-1 block";

export default function SsoSettings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [cfg, setCfg] = useState<SsoConfig | null>(null);
  const [form, setForm] = useState<SsoConfigInput>({});
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const c = await getSsoConfig();
        setCfg(c);
        setForm({
          enabled: c.enabled,
          issuer: c.issuer ?? "",
          clientId: c.clientId ?? "",
          scopes: c.scopes ?? "openid email profile",
          allowedDomain: c.allowedDomain ?? "",
          autoProvision: c.autoProvision ?? true,
          defaultRole: c.defaultRole ?? "AGENT",
        });
      } catch (e: any) {
        if (e?.status === 403) setForbidden(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k: keyof SsoConfigInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const next = await saveSsoConfig(form);
      setCfg(next);
      showToast("SSO configuration saved", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Could not save SSO config", "error");
    } finally {
      setSaving(false);
    }
  };

  const copyRedirect = () => {
    if (cfg?.redirectUri) {
      navigator.clipboard.writeText(cfg.redirectUri);
      showToast("Redirect URI copied", "success");
    }
  };

  if (loading) {
    return (
      <div className="min-h-full grid place-items-center bg-[#0b1530]">
        <Loader2 className="h-7 w-7 animate-spin text-white/40" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,#07111f,#0b1530)] p-8">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-violet-500/30 bg-violet-500/8 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
            <ShieldCheck className="h-7 w-7 text-violet-300" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white">Single Sign-On (SSO)</h1>
          <p className="mt-2 text-sm text-white/60">
            Connect Okta, Azure AD, Google Workspace or Auth0 and let your team sign in with your
            identity provider. Available on the <span className="font-bold text-violet-300">Enterprise</span> plan.
          </p>
          <button
            onClick={() => navigate("/billing/plans")}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-5 py-2.5 text-sm font-black text-violet-200 hover:bg-violet-500/30 transition"
          >
            <Crown className="h-4 w-4" /> See Enterprise plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(120,80,200,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[820px] space-y-6">

        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
                <ShieldCheck className="h-6 w-6 text-violet-300" />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold text-violet-200 ring-1 ring-violet-500/25">
                  Enterprise · OIDC SSO
                </div>
                <h1 className="mt-2 text-2xl font-black text-white">Single Sign-On</h1>
                <p className="text-sm text-white/50">Okta · Azure AD · Google Workspace · Auth0 · endpoints discovered from issuer metadata</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cfg?.enabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Enabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50">
                  <Lock className="h-3.5 w-3.5" /> Disabled
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Redirect URI callout */}
        <div className="rounded-[20px] border border-sky-500/25 bg-sky-500/8 p-5">
          <p className={LABEL}>Redirect URI (add this to your IdP app)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-xs text-sky-200">
              {cfg?.redirectUri ?? "—"}
            </code>
            <button onClick={copyRedirect} className="rounded-lg border border-white/10 bg-white/8 p-2 text-white/60 hover:text-white transition">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Config form */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-violet-300" /> OIDC provider
            </span>
            <label className="flex items-center gap-2 text-xs font-bold text-white/60">
              <input
                type="checkbox"
                checked={!!form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
              Enabled
            </label>
          </div>

          <p className="text-xs text-white/45">
            Provider endpoints are loaded from OIDC discovery and must resolve over HTTPS to public hosts.
            Client secrets are encrypted at rest; after the operator configures the server encryption key,
            re-enter any secret saved before this upgrade.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={LABEL}>Issuer URL</label>
              <input className={FIELD} placeholder="https://login.microsoftonline.com/<tenant>/v2.0"
                value={form.issuer ?? ""} onChange={(e) => set("issuer", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Client ID</label>
              <input className={FIELD} placeholder="abc123..." value={form.clientId ?? ""}
                onChange={(e) => set("clientId", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Client Secret {cfg?.clientSecretSet && <span className="text-emerald-400/70">(set)</span>}</label>
              <input className={FIELD} type="password" placeholder={cfg?.clientSecretSet ? "•••••••• (leave blank to keep)" : "Paste secret"}
                value={form.clientSecret ?? ""} onChange={(e) => set("clientSecret", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Scopes</label>
              <input className={FIELD} placeholder="openid email profile" value={form.scopes ?? ""}
                onChange={(e) => set("scopes", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Provisioning */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 space-y-5">
          <span className="text-sm font-black text-white flex items-center gap-2">
            <Building2 className="h-4 w-4 text-violet-300" /> Just-in-time provisioning
          </span>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Allowed email domain</label>
              <input className={FIELD} placeholder="acme.com" value={form.allowedDomain ?? ""}
                onChange={(e) => set("allowedDomain", e.target.value)} />
              <p className="mt-1 text-[11px] text-white/35">Only emails on this domain may sign in via SSO.</p>
            </div>
            <div>
              <label className={LABEL}>Default role for new users</label>
              <select className={FIELD} value={form.defaultRole ?? "AGENT"} onChange={(e) => set("defaultRole", e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={form.autoProvision ?? true}
              onChange={(e) => set("autoProvision", e.target.checked)} className="h-4 w-4 accent-violet-500" />
            Auto-create accounts on first SSO login
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-6 py-2.5 text-sm font-black text-violet-200 hover:bg-violet-500/30 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save configuration
          </button>
        </div>
      </div>
    </div>
  );
}
