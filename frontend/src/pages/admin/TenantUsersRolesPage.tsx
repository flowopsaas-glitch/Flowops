import React, { useEffect, useMemo, useState } from "react";
import { FLOWOPS_API_URL } from "../../lib/env";

type UserRow = {
  id: number;
  fullName?: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  active?: boolean;
  companyId?: number;
  companyName?: string;
  mustChangePassword?: boolean;
  permissions?: Record<string, boolean> | null;
};

type CompanyRow = {
  id: number;
  name?: string;
  companyName?: string;
};

const API_BASE = FLOWOPS_API_URL;

const PERMISSION_KEYS = [
  "dashboard",
  "collections",
  "dispatch",
  "drivers",
  "clients",
  "invoices",
  "billing",
  "quotes",
  "whatsapp",
  "emailhub",
  "settings",
  "reports",
  "aitools",
] as const;

type PermissionKey = (typeof PERMISSION_KEYS)[number];

const DEFAULT_ROLE_PRESETS: Record<string, Record<string, boolean>> = {
  COMPANY_ADMIN: {
    dashboard: true,
    collections: true,
    dispatch: true,
    drivers: true,
    clients: true,
    invoices: true,
    billing: true,
    quotes: true,
    whatsapp: true,
    emailhub: true,
    settings: true,
    reports: true,
    aitools: true,
  },
  COMPANY_USER: {
    dashboard: true,
    collections: true,
    dispatch: false,
    drivers: false,
    clients: true,
    invoices: false,
    billing: false,
    quotes: false,
    whatsapp: false,
    emailhub: false,
    settings: false,
    reports: false,
    aitools: false,
  },
  OPERATIONS: {
    dashboard: true,
    collections: true,
    dispatch: true,
    drivers: true,
    clients: true,
    invoices: false,
    billing: false,
    quotes: false,
    whatsapp: false,
    emailhub: false,
    settings: false,
    reports: true,
    aitools: false,
  },
  DISPATCH: {
    dashboard: true,
    collections: true,
    dispatch: true,
    drivers: true,
    clients: false,
    invoices: false,
    billing: false,
    quotes: false,
    whatsapp: false,
    emailhub: false,
    settings: false,
    reports: false,
    aitools: false,
  },
  ACCOUNTS: {
    dashboard: true,
    collections: false,
    dispatch: false,
    drivers: false,
    clients: true,
    invoices: true,
    billing: true,
    quotes: true,
    whatsapp: false,
    emailhub: true,
    settings: false,
    reports: true,
    aitools: false,
  },
  VIEW_ONLY: {
    dashboard: true,
    collections: false,
    dispatch: false,
    drivers: false,
    clients: false,
    invoices: false,
    billing: false,
    quotes: false,
    whatsapp: false,
    emailhub: false,
    settings: false,
    reports: false,
    aitools: false,
  },
};

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(58,123,255,0.18), transparent 18%), radial-gradient(circle at top right, rgba(0,212,255,0.10), transparent 20%), linear-gradient(180deg, #03132f 0%, #051a3d 40%, #061a38 100%)",
  color: "#EAF2FF",
  padding: "28px 20px 80px",
};

const shell: React.CSSProperties = {
  maxWidth: 1500,
  margin: "0 auto",
};

const hero: React.CSSProperties = {
  border: "1px solid rgba(120,170,255,0.18)",
  background:
    "linear-gradient(135deg, rgba(8,18,40,0.96) 0%, rgba(7,28,68,0.92) 55%, rgba(8,18,40,0.96) 100%)",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
  marginBottom: 18,
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginBottom: 18,
};

const statCard: React.CSSProperties = {
  border: "1px solid rgba(120,170,255,0.18)",
  background: "rgba(7,18,40,0.78)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const gridMain: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.05fr 0.95fr 1.2fr",
  gap: 16,
  alignItems: "start",
};

const card: React.CSSProperties = {
  border: "1px solid rgba(120,170,255,0.16)",
  background: "rgba(6,18,38,0.82)",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 14px 40px rgba(0,0,0,0.24)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "#86A9E6",
  marginBottom: 6,
  display: "block",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(5,18,42,0.96)",
  color: "#F3F7FF",
  border: "1px solid rgba(84,133,224,0.28)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
  fontSize: 14,
  marginBottom: 12,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "11px 16px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  color: "#071427",
  background: "linear-gradient(135deg, #9CC2FF 0%, #5D91F6 100%)",
  boxShadow: "0 8px 20px rgba(93,145,246,0.35)",
};

const softButton: React.CSSProperties = {
  ...buttonStyle,
  background: "rgba(11,28,58,0.92)",
  color: "#DDEAFF",
  border: "1px solid rgba(120,170,255,0.22)",
  boxShadow: "none",
};

const badge = (active?: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.6,
  background: active ? "rgba(36,209,122,0.12)" : "rgba(255,92,92,0.12)",
  color: active ? "#71F0AE" : "#FF9D9D",
  border: active
    ? "1px solid rgba(36,209,122,0.24)"
    : "1px solid rgba(255,92,92,0.24)",
});

function getToken() {
  return (
    localStorage.getItem("flowops_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

function getUser() {
  try {
    const raw =
      localStorage.getItem("flowops_user") ||
      localStorage.getItem("user") ||
      "";
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function text(v: any, fallback = "") {
  return String(v ?? fallback ?? "").trim();
}

async function readJson(response: Response) {
  const t = await response.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { raw: t };
  }
}

function normalizePermissions(input: any, role?: string): Record<string, boolean> {
  const preset = DEFAULT_ROLE_PRESETS[String(role || "").toUpperCase()] || {};
  const out: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) {
    out[key] = Boolean(input?.[key] ?? preset[key] ?? false);
  }
  return out;
}

export default function TenantUsersRolesPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(1);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("COMPANY_ADMIN");

  const [resetPassword, setResetPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>(
    normalizePermissions({}, "COMPANY_ADMIN")
  );

  const currentUser = getUser();
  const token = getToken();
  const isOwner =
    String(currentUser?.role || "").toUpperCase().includes("OWNER") ||
    window.location.pathname.includes("/admin") ||
    window.location.pathname.includes("/owner");

  const selectedCompany = useMemo(
    () => companies.find((c) => Number(c.id) === Number(selectedCompanyId)),
    [companies, selectedCompanyId]
  );

  const selectedUser = useMemo(
    () => users.find((u) => Number(u.id) === Number(selectedUserId)),
    [users, selectedUserId]
  );

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive ?? u.active).length;
    const inactive = users.length - active;
    const admins = users.filter((u) =>
      String(u.role || "").toUpperCase().includes("ADMIN")
    ).length;
    return { total: users.length, active, inactive, admins };
  }, [users]);

  async function api(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(text(data?.message, "Request failed"));
    }
    return data;
  }

  async function loadCompanies() {
    try {
      const data = await api("/owner/access/companies");
      const rows = Array.isArray(data) ? data : Array.isArray(data?.companies) ? data.companies : [];
      const mapped = rows.map((item: any) => ({
        id: Number(item?.id || 0),
        name: text(item?.name || item?.companyName || `Company ${item?.id}`),
      }));
      setCompanies(mapped);
      if (mapped.length && !mapped.find((c: any) => c.id === selectedCompanyId)) {
        setSelectedCompanyId(Number(mapped[0].id));
      }
    } catch (err: any) {
      console.warn("loadCompanies failed", err?.message);
    }
  }

  async function loadUsers(companyId?: number) {
    setBusy(true);
    setStatus("");
    try {
      let data: any;

      if (isOwner) {
        const safeCompanyId = Number(companyId || selectedCompanyId || 1);
        data = await api(`/owner/access/company/${safeCompanyId}/users`);
      } else {
        data = await api("/users/my-company");
      }

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.users)
        ? data.users
        : [];

      const mapped = rows.map((item: any) => ({
        id: Number(item?.id || 0),
        fullName: text(item?.fullName || item?.name || item?.firstName || "Unnamed User"),
        email: text(item?.email),
        role: text(item?.role || "COMPANY_USER"),
        isActive: Boolean(item?.isActive ?? item?.active ?? true),
        companyId: Number(item?.companyId || companyId || selectedCompanyId || 1),
        companyName: text(item?.companyName || selectedCompany?.name || ""),
        mustChangePassword: Boolean(item?.mustChangePassword ?? false),
        permissions: normalizePermissions(item?.permissions || {}, item?.role),
      }));

      setUsers(mapped);
      if (mapped.length) {
        setSelectedUserId(Number(mapped[0].id));
      } else {
        setSelectedUserId(0);
      }
    } catch (err: any) {
      setUsers([]);
      setStatus(err?.message || "Failed to load users");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isOwner) {
      loadCompanies().then(() => loadUsers(selectedCompanyId));
    } else {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOwner && selectedCompanyId) {
      loadUsers(selectedCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  useEffect(() => {
    if (selectedUser) {
      setPermissionDraft(normalizePermissions(selectedUser.permissions || {}, selectedUser.role));
    } else {
      setPermissionDraft(normalizePermissions({}, role));
    }
  }, [selectedUser, role]);

  async function handleCreateUser() {
    setBusy(true);
    setStatus("");
    try {
      if (!fullName || !email || !password) {
        throw new Error("Full name, email, and password are required.");
      }

      const payload = {
        fullName,
        email,
        password,
        role,
        permissions: normalizePermissions(permissionDraft, role),
      };

      if (isOwner) {
        await api(`/owner/access/company/${selectedCompanyId}/admins`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/users/my-company", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setStatus("Tenant user created successfully.");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("COMPANY_ADMIN");
      setPermissionDraft(normalizePermissions({}, "COMPANY_ADMIN"));
      await loadUsers(selectedCompanyId);
    } catch (err: any) {
      setStatus(err?.message || "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    setBusy(true);
    setStatus("");
    try {
      if (!selectedUserId) throw new Error("Select a user first.");
      if (!resetPassword || resetPassword.length < 6) {
        throw new Error("New password must be at least 6 characters.");
      }

      await api(`/owner/access/users/${selectedUserId}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: resetPassword }),
      });

      setStatus("Password reset completed.");
      setResetPassword("");
      await loadUsers(selectedCompanyId);
    } catch (err: any) {
      setStatus(err?.message || "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleUser() {
    setBusy(true);
    setStatus("");
    try {
      if (!selectedUserId) throw new Error("Select a user first.");

      await api(`/owner/access/users/${selectedUserId}/toggle`, {
        method: "PATCH",
      });

      setStatus("User status updated.");
      await loadUsers(selectedCompanyId);
    } catch (err: any) {
      setStatus(err?.message || "Failed to toggle user");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUser() {
    setBusy(true);
    setStatus("");
    try {
      if (!selectedUserId) throw new Error("Select a user first.");

      await api(`/owner/access/users/${selectedUserId}/delete`, {
        method: "POST",
      });

      setStatus("Tenant user deleted.");
      await loadUsers(selectedCompanyId);
    } catch (err: any) {
      setStatus(err?.message || "Failed to delete user");
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePermissions() {
    setBusy(true);
    setStatus("");
    try {
      if (!selectedUserId) throw new Error("Select a user first.");

      const payload = {
        permissions: normalizePermissions(permissionDraft, selectedUser?.role),
      };

      await api(`/users/${selectedUserId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setStatus("Permissions saved successfully.");
      await loadUsers(selectedCompanyId);
    } catch (err: any) {
      setStatus(err?.message || "Failed to save permissions");
    } finally {
      setBusy(false);
    }
  }

  function applyRolePreset(nextRole: string) {
    const normalized = String(nextRole || "COMPANY_USER").toUpperCase();
    setRole(normalized);
    setPermissionDraft(normalizePermissions({}, normalized));
  }

  function updatePermission(key: PermissionKey, value: boolean) {
    setPermissionDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <div style={pageWrap}>
      <div style={shell}>
        <div style={hero}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8FB5FF", fontWeight: 800 }}>
            FlowOps Tenant Access Layer
          </div>
          <h1 style={{ margin: "10px 0 8px", fontSize: 34, lineHeight: 1.05 }}>
            Users, Roles & Permissions Control Center
          </h1>
          <div style={{ color: "#9DB6E6", maxWidth: 900, fontSize: 14 }}>
            Manage tenant company users, role assignment, account access, temporary password resets, and page-level visibility from one premium operational control surface.
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(57,203,161,0.25)",
              background: "rgba(18,73,66,0.18)",
              color: "#87F1D2",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {status || `Connected to ${API_BASE}`}
          </div>
        </div>

        <div style={statGrid}>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>Total Users</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{stats.total}</div>
            <div style={{ color: "#8CA5D6", fontSize: 13, marginTop: 6 }}>All tenant user accounts.</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>Active Users</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{stats.active}</div>
            <div style={{ color: "#8CA5D6", fontSize: 13, marginTop: 6 }}>Users currently active.</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>Inactive Users</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{stats.inactive}</div>
            <div style={{ color: "#8CA5D6", fontSize: 13, marginTop: 6 }}>Accounts needing review.</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>Admin-Level Users</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{stats.admins}</div>
            <div style={{ color: "#8CA5D6", fontSize: 13, marginTop: 6 }}>Operational control holders.</div>
          </div>
        </div>

        <div style={gridMain}>
          <div style={card}>
            <h2 style={{ marginTop: 0, marginBottom: 14 }}>Create Tenant User</h2>

            {isOwner && (
              <>
                <label style={labelStyle}>Target Company</label>
                <select
                  style={inputStyle}
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name || `Company ${company.id}`}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Operations Manager" />

            <label style={labelStyle}>Email</label>
            <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@company.com" />

            <label style={labelStyle}>Temporary Password</label>
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

            <label style={labelStyle}>Role</label>
            <select
              style={inputStyle}
              value={role}
              onChange={(e) => applyRolePreset(e.target.value)}
            >
              <option value="COMPANY_ADMIN">COMPANY_ADMIN</option>
              <option value="COMPANY_USER">COMPANY_USER</option>
              <option value="OPERATIONS">OPERATIONS</option>
              <option value="DISPATCH">DISPATCH</option>
              <option value="ACCOUNTS">ACCOUNTS</option>
              <option value="VIEW_ONLY">VIEW_ONLY</option>
            </select>

            <button style={{ ...buttonStyle, width: "100%" }} onClick={handleCreateUser} disabled={busy}>
              {busy ? "Creating..." : "Create Tenant User"}
            </button>
          </div>

          <div style={card}>
            <h2 style={{ marginTop: 0, marginBottom: 14 }}>Reset Password + Access</h2>

            <label style={labelStyle}>Select User</label>
            <select
              style={inputStyle}
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(Number(e.target.value))}
            >
              <option value={0}>Select tenant user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} — {user.role}
                </option>
              ))}
            </select>

            <div
              style={{
                border: "1px solid rgba(120,170,255,0.16)",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                background: "rgba(7,16,34,0.75)",
              }}
            >
              <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>
                Selected User
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>
                {selectedUser?.fullName || "No user selected"}
              </div>
              <div style={{ color: "#91A9D8", marginTop: 6 }}>
                {selectedUser?.email || "Choose a user to reset credentials."}
              </div>
              {selectedUser?.role ? (
                <div style={{ color: "#86A9E6", marginTop: 8, fontSize: 13 }}>
                  Role: {selectedUser.role}
                </div>
              ) : null}
            </div>

            <label style={labelStyle}>New Password</label>
            <input
              style={inputStyle}
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Reset password for selected user"
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={{ ...buttonStyle, flex: 1 }} onClick={handleResetPassword} disabled={busy}>
                Reset Tenant Password
              </button>
              <button style={{ ...softButton, flex: 1 }} onClick={handleToggleUser} disabled={busy}>
                Toggle Active
              </button>
            </div>

            <button
              style={{
                ...softButton,
                width: "100%",
                marginTop: 10,
                borderColor: "rgba(255,102,102,0.22)",
                color: "#FFB3B3",
              }}
              onClick={handleDeleteUser}
              disabled={busy}
            >
              Delete Selected User
            </button>
          </div>

          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Tenant User Directory</h2>
              <button style={softButton} onClick={() => loadUsers(selectedCompanyId)} disabled={busy}>
                Refresh
              </button>
            </div>

            <div style={{ display: "grid", gap: 12, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {users.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed rgba(120,170,255,0.18)",
                    borderRadius: 16,
                    padding: 18,
                    color: "#89A3D6",
                  }}
                >
                  No tenant users found.
                </div>
              ) : (
                users.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUserId(Number(user.id))}
                    style={{
                      border: selectedUserId === user.id
                        ? "1px solid rgba(125,175,255,0.44)"
                        : "1px solid rgba(120,170,255,0.14)",
                      borderRadius: 16,
                      padding: 14,
                      background:
                        selectedUserId === user.id
                          ? "linear-gradient(135deg, rgba(83,134,230,0.20), rgba(6,17,37,0.92))"
                          : "rgba(6,17,37,0.74)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{user.fullName}</div>
                        <div style={{ color: "#92ABDB", fontSize: 13, marginTop: 4 }}>{user.email}</div>
                        <div style={{ color: "#86A9E6", fontSize: 12, marginTop: 8 }}>
                          {user.role} {user.mustChangePassword ? "• Must change password" : ""}
                        </div>
                      </div>
                      <div style={badge(user.isActive)}>
                        {user.isActive ? "ACTIVE" : "INACTIVE"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>
                Role & Permission Matrix
              </div>
              <h2 style={{ margin: "8px 0 0", fontSize: 28 }}>
                Sidebar + Access Visibility Control
              </h2>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={softButton}
                onClick={() => {
                  if (selectedUser?.role) {
                    setPermissionDraft(normalizePermissions({}, selectedUser.role));
                    setStatus(`Applied ${selectedUser.role} role preset.`);
                  }
                }}
                disabled={!selectedUser?.role || busy}
              >
                Apply Selected User Role Preset
              </button>

              <button style={buttonStyle} onClick={handleSavePermissions} disabled={!selectedUserId || busy}>
                Save Permissions
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            {PERMISSION_KEYS.map((key) => {
              const enabled = Boolean(permissionDraft[key]);
              return (
                <div
                  key={key}
                  style={{
                    border: enabled
                      ? "1px solid rgba(88,184,255,0.32)"
                      : "1px solid rgba(120,170,255,0.14)",
                    borderRadius: 18,
                    padding: 16,
                    background: enabled
                      ? "linear-gradient(135deg, rgba(36,78,155,0.22), rgba(8,20,42,0.92))"
                      : "rgba(7,18,38,0.70)",
                    boxShadow: enabled ? "0 10px 28px rgba(63,118,255,0.18)" : "none",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Access Area
                  </div>

                  <div style={{ fontWeight: 900, fontSize: 18, marginTop: 8, marginBottom: 12 }}>
                    {key}
                  </div>

                  <button
                    onClick={() => updatePermission(key, !enabled)}
                    style={{
                      ...buttonStyle,
                      width: "100%",
                      background: enabled
                        ? "linear-gradient(135deg, #8FF1C0 0%, #56D29D 100%)"
                        : "linear-gradient(135deg, #9CC2FF 0%, #5D91F6 100%)",
                    }}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 18,
              border: "1px solid rgba(120,170,255,0.14)",
              borderRadius: 18,
              padding: 16,
              background: "rgba(7,18,38,0.55)",
            }}
          >
            <div style={{ fontSize: 11, color: "#88A6DD", letterSpacing: 1.2, textTransform: "uppercase" }}>
              AI Access Guidance
            </div>
            <div style={{ marginTop: 10, color: "#DDEAFF", lineHeight: 1.7 }}>
              Recommended approach:
              <br />
              • <strong>COMPANY_ADMIN</strong> = full tenant control
              <br />
              • <strong>OPERATIONS</strong> = collections, dispatch, drivers, clients
              <br />
              • <strong>DISPATCH</strong> = dispatch workflow only
              <br />
              • <strong>ACCOUNTS</strong> = invoices, billing, quotes, email
              <br />
              • <strong>VIEW_ONLY</strong> = safe read-only visibility
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
