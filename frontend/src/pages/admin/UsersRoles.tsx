import React, { useEffect, useMemo, useState } from "react";
import api from '../../api/client';
import {
  ALL_TENANT_NAV_PERMISSION_KEYS,
  TENANT_NAV_PERMISSION_LABELS,
  buildRoleDefaultTenantNavPermissions,
  normalizeTenantNavPermissions,
  type TenantNavPermissionKey,
  type TenantNavPermissions,
} from "../../lib/tenantUserPermissions";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

type UserRow = {
  id: string;
  email: string;
  role: string;
  companyId?: number | null;
  permissions?: TenantNavPermissions | null;
};

type CreateForm = {
  email: string;
  password: string;
  role: string;
  permissions: TenantNavPermissions;
};

type DriverRow = {
  id: string;
  name: string;
  phone?: string | null;
  vehicleReg?: string | null;
  status: string;
  hasPinSet: boolean;
};

const glassCard =
  "rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.25)] backdrop-blur";

function clonePermissions(input: TenantNavPermissions): TenantNavPermissions {
  return { ...input };
}

export default function UsersRoles() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState<CreateForm>({
    email: "",
    password: "",
    role: "USER",
    permissions: buildRoleDefaultTenantNavPermissions("USER"),
  });

  // ── Driver PIN state ────────────────────────────────────────────────────
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinSaving, setPinSaving] = useState<string | null>(null);
  const [pinMsg, setPinMsg] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const res = await api.get("/users/my-company");
      const list = Array.isArray(res?.data) ? res.data : [];
      setRows(
        list.map((item: any) => ({
          id: String(item.id),
          email: String(item.email || ""),
          role: String(item.role || "USER"),
          companyId: item.companyId ?? null,
          permissions: normalizeTenantNavPermissions(item.permissions, item.role),
        }))
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    void loadDrivers();
  }, []);

  async function loadDrivers() {
    setDriverLoading(true);
    try {
      const res = await api.get("/drivers");
      const raw = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setDrivers(raw.map((d: any) => ({
        id: String(d.id),
        name: d.name || "—",
        phone: d.phone,
        vehicleReg: d.vehicleReg,
        status: d.status || "OFFLINE",
        hasPinSet: !!d.driverPin,
      })));
    } catch {
      // silently skip
    } finally {
      setDriverLoading(false);
    }
  }

  async function handleSetPin(driverId: string) {
    const pin = pinInputs[driverId]?.trim();
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setPinMsg("PIN must be 4–6 digits.");
      return;
    }
    setPinSaving(driverId);
    setPinMsg("");
    try {
      await api.patch(`/drivers/${driverId}/pin`, { pin });
      setPinMsg("PIN set successfully.");
      setPinInputs((p) => ({ ...p, [driverId]: "" }));
      void loadDrivers();
    } catch {
      setPinMsg("Failed to set PIN.");
    } finally {
      setPinSaving(null);
    }
  }

  async function handleResetPin(driverId: string) {
    setPinSaving(driverId);
    setPinMsg("");
    try {
      await api.patch(`/drivers/${driverId}/reset-pin`, {});
      setPinMsg("PIN cleared. Driver must be issued a new PIN.");
      void loadDrivers();
    } catch {
      setPinMsg("Failed to reset PIN.");
    } finally {
      setPinSaving(null);
    }
  }

  function setFormRole(role: string) {
    setForm((prev) => ({
      ...prev,
      role,
      permissions: buildRoleDefaultTenantNavPermissions(role),
    }));
  }

  function toggleCreatePermission(key: TenantNavPermissionKey) {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  }

  async function createUser() {
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/users", {
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        permissions: form.permissions,
      });

      setSuccess("Tenant user created successfully.");
      setForm({
        email: "",
        password: "",
        role: "USER",
        permissions: buildRoleDefaultTenantNavPermissions("USER"),
      });

      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  async function saveUserPermissions(row: UserRow) {
    setSavingUserId(row.id);
    setError("");
    setSuccess("");

    try {
      await api.patch(`/users/${row.id}`, {
        role: row.role,
        permissions: row.permissions,
      });

      setSuccess(`Saved permissions for ${row.email}.`);
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to save permissions.");
    } finally {
      setSavingUserId(null);
    }
  }

  function setRowRole(userId: string, nextRole: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === userId
          ? {
              ...row,
              role: nextRole,
              permissions: buildRoleDefaultTenantNavPermissions(nextRole),
            }
          : row
      )
    );
  }

  function toggleRowPermission(userId: string, key: TenantNavPermissionKey) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === userId
          ? {
              ...row,
              permissions: {
                ...normalizeTenantNavPermissions(row.permissions, row.role),
                [key]: !normalizeTenantNavPermissions(row.permissions, row.role)[key],
              },
            }
          : row
      )
    );
  }

  const permissionKeys = useMemo(() => ALL_TENANT_NAV_PERMISSION_KEYS, []);

  return (
    <div className="space-y-6 text-white">
      <div className={glassCard}>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300/75">
          Tenant access control
        </div>
        <div className="mt-3 text-3xl font-black tracking-tight">Users & Roles</div>
        <div className="mt-3 max-w-4xl text-sm leading-7 text-white/65">
          Create tenant users and control exactly which sidebar panels each user can see.
          Company permissions remain the outer limit. User permissions narrow access inside the tenant.
        </div>
      </div>

      <div className={glassCard}>
        <div className="text-xl font-black">Create Tenant User</div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Email</div>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="user@company.com"
              type="email"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Password</div>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Minimum 6 characters"
              type="password"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Role</div>
            <select
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
              value={form.role}
              onChange={(e) => setFormRole(e.target.value)}
            >
              <option value="USER">USER</option>
              <option value="DISPATCH">DISPATCH</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
              <option value="DRIVER">DRIVER</option>
              <option value="MANAGER">MANAGER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="COMPANY_ADMIN">COMPANY_ADMIN</option>
            </select>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 text-sm font-bold text-white">Sidebar panel access for new user</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {permissionKeys.map((key) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <span className="text-sm text-white/85">{TENANT_NAV_PERMISSION_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={form.permissions[key]}
                  onChange={() => toggleCreatePermission(key)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={createUser}
            disabled={creating || !form.email.trim() || !form.password.trim()}
            className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Tenant User"}
          </button>

          {success ? <div className="text-sm text-emerald-300">{success}</div> : null}
          {error ? <div className="text-sm text-rose-300">{error}</div> : null}
        </div>
      </div>

      <div className={glassCard}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-black">Existing Tenant Users</div>
            <div className="mt-1 text-sm text-white/60">
              Change role defaults and save exact sidebar visibility per user.
            </div>
          </div>

          <button
            onClick={loadUsers}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-white/65">Loading tenant users...</div>
        ) : (
          <div className="mt-6 space-y-5">
            {rows.map((row) => {
              const perms = normalizeTenantNavPermissions(row.permissions, row.role);

              return (
                <div key={row.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="grid gap-4 md:grid-cols-[1.6fr,220px,180px] md:items-end">
                    <div>
                      <div className="text-lg font-black text-white">{row.email}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.25em] text-white/45">
                        User ID {row.id}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Role</div>
                      <select
                        className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
                        value={row.role}
                        onChange={(e) => setRowRole(row.id, e.target.value)}
                      >
                        <option value="USER">USER</option>
                        <option value="DISPATCH">DISPATCH</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="COMPANY_ADMIN">COMPANY_ADMIN</option>
                      </select>
                    </div>

                    <div>
                      <button
                        onClick={() => saveUserPermissions({ ...row, permissions: perms })}
                        disabled={savingUserId === row.id}
                        className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                      >
                        {savingUserId === row.id ? "Saving..." : "Save User Access"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {permissionKeys.map((key) => (
                      <label
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3"
                      >
                        <span className="text-sm text-white/85">{TENANT_NAV_PERMISSION_LABELS[key]}</span>
                        <input
                          type="checkbox"
                          checked={perms[key]}
                          onChange={() => toggleRowPermission(row.id, key)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            {!rows.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-white/60">
                No tenant users found.
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Driver Accounts & PIN Management ─────────────────────────────── */}
      <div className={glassCard}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 grid place-items-center">
            <KeyRound className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <div className="text-xl font-black">Driver Accounts & PINs</div>
            <div className="text-xs text-white/45 mt-0.5">
              Set or reset 4–6 digit PINs for driver portal login (phone + PIN)
            </div>
          </div>
        </div>

        {pinMsg && (
          <div className={`mb-4 rounded-2xl px-4 py-2.5 text-sm font-bold ${pinMsg.includes("success") || pinMsg.includes("cleared") ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" : "bg-red-500/15 text-red-300 border border-red-500/25"}`}>
            {pinMsg}
          </div>
        )}

        {driverLoading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />)}
          </div>
        ) : drivers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-white/40">
            No drivers found. Add drivers in the Driver Dispatch page first.
          </div>
        ) : (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white">{d.name}</div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {d.phone || "—"} {d.vehicleReg ? `· ${d.vehicleReg}` : ""} · {d.status}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-[11px] font-bold border ${d.hasPinSet ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
                  {d.hasPinSet ? <><ShieldCheck className="h-3.5 w-3.5" /> PIN set</> : <><ShieldOff className="h-3.5 w-3.5" /> No PIN</>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1000"
                    max="999999"
                    value={pinInputs[d.id] ?? ""}
                    onChange={(e) => setPinInputs(p => ({ ...p, [d.id]: e.target.value }))}
                    placeholder="New PIN"
                    className="w-24 rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-sky-400 [appearance:textfield]"
                  />
                  <button
                    onClick={() => handleSetPin(d.id)}
                    disabled={pinSaving === d.id}
                    className="rounded-xl bg-sky-500/20 border border-sky-500/30 px-3 py-2 text-sm font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-40 transition"
                  >
                    {pinSaving === d.id ? "…" : "Set PIN"}
                  </button>
                  {d.hasPinSet && (
                    <button
                      onClick={() => handleResetPin(d.id)}
                      disabled={pinSaving === d.id}
                      className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
