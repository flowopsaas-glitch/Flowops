import { errorMessageOf } from "@/components/patterns/errorMessage";
import {useCallback,  useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "../../api/client";
import { startImpersonation } from "../../lib/impersonation";

type TenantRow = { id: string; name: string; plan?: string | null; isActive: boolean };
type UserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  isActive?: boolean;
  createdAt: string;
};

function unwrap<T>(res: unknown): T { return ((res as { data?: T } | null)?.data ?? res) as T; }

// ── Sub-panel: user list for selected tenant ────────────────────────────
function TenantUserPanel(props: { tenant: TenantRow; onImpersonate: () => void }) {
  const { tenant } = props;
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const loadUsers = useCallback(() => (async () => {
    const res = await api.get(`/owner/tenants/${tenant.id}/users`);
    const d = unwrap<UserRow[] | { data?: UserRow[] }>(res);
    setUsers(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);

  })().catch((err: unknown) => {
    setError(errorMessageOf(err) || "Failed to load users.");

  }).finally(() => {
    setLoading(false);

  }), [tenant.id]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function createUser() {
    if (!newUser.email || !newUser.password) { setError("Email and password are required."); return; }
    setBusy("create");
    setError(""); setSuccess("");
    try {
      await api.post(`/owner/tenants/${tenant.id}/users`, newUser);
      setNewUser({ name: "", email: "", password: "" });
      setShowCreate(false);
      setSuccess("Admin user created.");
      await loadUsers();
    } catch (err) { setError(errorMessageOf(err) || "Failed to create user."); }
    finally { setBusy(""); }
  }

  async function resetPassword() {
    if (!resetTarget || !newPassword) return;
    setBusy(`reset-${resetTarget.id}`);
    setError(""); setSuccess("");
    try {
      await api.patch(`/owner/users/${resetTarget.id}/password`, { password: newPassword });
      setResetTarget(null);
      setNewPassword("");
      setSuccess(`Password reset for ${resetTarget.email}.`);
    } catch (err) { setError(errorMessageOf(err) || "Failed to reset password."); }
    finally { setBusy(""); }
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl space-y-5">
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-black text-white">{tenant.name}</div>
          <div className="mt-0.5 text-sm text-slate-400 capitalize">{tenant.plan ?? "starter"} plan · {tenant.isActive ? "Active" : "Suspended"}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowCreate((v) => !v); setError(""); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20">
            <Plus className="h-3.5 w-3.5" /> Add Admin
          </button>
          <button onClick={props.onImpersonate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20">
            <Eye className="h-3.5 w-3.5" /> View as Tenant
          </button>
          <button onClick={loadUsers}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Feedback */}
      {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">{success}</div> : null}

      {/* Create admin form */}
      {showCreate ? (
        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/5 p-4 space-y-3">
          <div className="text-sm font-bold text-emerald-200">Create Admin User</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { key: "name", label: "Name", ph: "Jane Smith" },
              { key: "email", label: "Email *", ph: "jane@tenant.com" },
              { key: "password", label: "Password *", ph: "••••••••" },
            ].map(({ key, label, ph }) => (
              <div key={key}>
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">{label}</label>
                <input
                  type={key === "password" ? "password" : "text"}
                  value={newUser[key as keyof typeof newUser]}
                  onChange={(e) => setNewUser((u) => ({ ...u, [key]: e.target.value }))}
                  placeholder={ph}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button disabled={busy === "create"} onClick={createUser}
              className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">
              {busy === "create" ? "Creating…" : "Create"}
            </button>
            <button onClick={() => { setShowCreate(false); setNewUser({ name: "", email: "", password: "" }); }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white">Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Reset password modal */}
      {resetTarget ? (
        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4 space-y-3">
          <div className="text-sm font-bold text-blue-200">Reset password for {resetTarget.email}</div>
          <div className="flex items-center gap-3">
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="flex-1 rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400 max-w-xs" />
            <button disabled={!newPassword || busy.startsWith("reset")} onClick={resetPassword}
              className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-200 disabled:opacity-60">
              {busy.startsWith("reset") ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setResetTarget(null); setNewPassword(""); }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white">Cancel</button>
          </div>
        </div>
      ) : null}

      {/* User table */}
      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No users yet for this tenant.</div>
      ) : (
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
              <th className="px-3 py-2">Name / Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5">
                <td className="px-3 py-3">
                  <div className="font-semibold text-white">{u.name || "—"}</div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </td>
                <td className="px-3 py-3 capitalize text-slate-300">{u.role?.toLowerCase()}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${u.isActive !== false ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-slate-400/20 bg-slate-500/10 text-slate-300"}`}>
                    {u.isActive !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString("en-ZA")}</td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => { setResetTarget(u); setNewPassword(""); setShowCreate(false); }}
                    className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-white/10">
                    <KeyRound className="h-3 w-3" /> Reset PW
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function OwnerAccessManager() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TenantRow | null>(null);
  const [error, setError] = useState("");

  const loadTenants = useCallback(() => (async () => {
    try {
      const res = await api.get("/owner/tenants");
      const d = unwrap<TenantRow[] | { data?: TenantRow[] }>(res);
      const rows: TenantRow[] = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      setTenants(rows);
      if (rows.length > 0) setSelected((current) => current ?? rows[0]);
    } catch (err) {
      setError(errorMessageOf(err) || "Failed to load tenants.");
    } finally {
      setLoading(false);
    }
  })(), []);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  async function viewAs(tenant: TenantRow) {
    try {
      const res = await api.post(`/owner/impersonate/${tenant.id}`, {});
      const token = unwrap<{ access_token?: string }>(res)?.access_token;
      if (!token) throw new Error("No impersonation token");
      startImpersonation(token, tenant.name);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(errorMessageOf(err) || "Impersonation failed.");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => (t.name + " " + (t.plan ?? "")).toLowerCase().includes(q));
  }, [tenants, query]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
              <Lock className="h-3.5 w-3.5" /> Access &amp; Password Manager
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Tenant Access Control</h1>
            <p className="mt-2 text-slate-300">
              Select a tenant to manage their admin users, reset passwords, create new admin accounts, and impersonate their workspace.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadTenants}
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={() => navigate("/owner/dashboard")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
              ← Dashboard
            </button>
          </div>
        </div>
        {error ? <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        {/* Tenant sidebar */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-4 shadow-xl h-fit">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Users className="h-4 w-4 text-white/50" />
            Tenants ({filtered.length})
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tenants…"
              className="w-full rounded-xl border border-white/10 bg-[#071224] pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
          </div>
          <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-6 text-center text-sm text-slate-400">Loading…</div>
            ) : filtered.map((t) => (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${selected?.id === t.id ? "bg-white/10 border border-white/20" : "border border-transparent hover:bg-white/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white truncate">{t.name}</span>
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${t.isActive ? "bg-emerald-400" : "bg-rose-400"}`} />
                </div>
                <div className="text-xs text-slate-400 capitalize mt-0.5">{t.plan ?? "starter"}</div>
              </button>
            ))}
          </div>
        </div>

        {/* User management panel */}
        {selected ? (
          <TenantUserPanel key={selected.id} tenant={selected} onImpersonate={() => viewAs(selected)} />
        ) : (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-12 grid place-items-center shadow-xl">
            <div className="text-center">
              <UserCheck className="mx-auto h-10 w-10 text-white/20 mb-3" />
              <div className="text-white/40">Select a tenant on the left to manage their users</div>
            </div>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-cyan-400 flex-shrink-0" />
          <div className="text-sm text-slate-400">
            <span className="font-bold text-white">Owner access actions are audit-logged.</span> Password resets, admin creation, and impersonation are recorded in the{" "}
            <button onClick={() => navigate("/owner/audit")} className="text-cyan-300 underline">Audit Trail</button>{" "}
            with actor identity and timestamp.
          </div>
        </div>
      </div>
    </div>
  );
}
