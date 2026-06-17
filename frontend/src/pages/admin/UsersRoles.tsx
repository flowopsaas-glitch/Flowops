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
  }, []);

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
      await api.post("/users/my-company", {
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
    </div>
  );
}
