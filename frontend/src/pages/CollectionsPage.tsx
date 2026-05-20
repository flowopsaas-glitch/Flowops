import { useToast } from '../components/ToastProvider';
// src/pages/CollectionsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from '../api/client';

type Company = {
  id: number;
  name: string;
};

type Audit = {
  id: number;
  action: "REQUESTED" | "AUTO_APPROVED" | "APPROVED" | "REJECTED";
  reason?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  aiRiskScore?: number | null;
  aiConfidence?: number | null;
  aiExplanation?: string | null;
  createdAt: string;
};

type Collection = {
  id: number;
  name: string;

  // lifecycle state (ops)
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | string;

  // governance gate
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | string;

  createdAt: string;
  updatedAt?: string;

  // optional AI fields
  aiRiskScore?: number | null;
  aiConfidence?: number | null;
  aiExplanation?: string | null;
  aiScoredAt?: string | null;

  // optional relations
  companyId?: number;
  company?: Company;

  audits?: Audit[];

  // optional UI/risk flags (if your API provides them)
  aiRiskFlags?: string[] | null;
};

type ViewMode = "EXEC" | "OPS";

// ---------- role helpers ----------
function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getCurrentRole(): string | null {
  const user = safeJsonParse<any>(localStorage.getItem("user"));
  if (user?.role) return String(user.role);

  const auth = safeJsonParse<any>(localStorage.getItem("auth"));
  if (auth?.user?.role) return String(auth.user.role);
  if (auth?.role) return String(auth.role);

  const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    safeJsonParse<any>(localStorage.getItem("auth"))?.accessToken ||
    safeJsonParse<any>(localStorage.getItem("auth"))?.token ||
    null;

  if (token) {
    const payload = decodeJwtPayload(token);
    if (payload?.role) return String(payload.role);
    if (payload?.user?.role) return String(payload.user.role);
  }

  return null;
}

// ---------- formatting ----------
function formatDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function asUpper(v: any) {
  return String(v ?? "").toUpperCase();
}

function badgeColor(type: "gray" | "green" | "red" | "yellow" | "blue") {
  const map: Record<string, { bg: string; fg: string; bd: string }> = {
    gray: { bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.85)", bd: "rgba(255,255,255,0.10)" },
    green: { bg: "rgba(34,197,94,0.14)", fg: "rgba(209,250,229,0.92)", bd: "rgba(34,197,94,0.25)" },
    red: { bg: "rgba(239,68,68,0.14)", fg: "rgba(254,226,226,0.92)", bd: "rgba(239,68,68,0.25)" },
    yellow: { bg: "rgba(234,179,8,0.16)", fg: "rgba(254,249,195,0.92)", bd: "rgba(234,179,8,0.25)" },
    blue: { bg: "rgba(59,130,246,0.16)", fg: "rgba(219,234,254,0.92)", bd: "rgba(59,130,246,0.25)" },
  };
  return map[type];
}

function statusKind(status: string) {
  const s = asUpper(status);
  if (s === "COMPLETED") return "green";
  if (s === "CANCELLED") return "red";
  if (s === "IN_PROGRESS") return "blue";
  if (s === "PENDING") return "yellow";
  return "gray";
}

function approvalKind(approvalStatus: string) {
  const s = asUpper(approvalStatus);
  if (s === "APPROVED") return "green";
  if (s === "REJECTED") return "red";
  if (s === "PENDING") return "yellow";
  return "gray";
}

function riskLabel(score?: number | null) {
  if (typeof score !== "number") return "Not scored";
  if (score >= 80) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

// ---------- endpoints (adjust if your backend differs) ----------
const ENDPOINTS = {
  companies: "/companies",
  collections: "/collections",
  approve: (id: number) => `/collections/${id}/approve`,
  reject: (id: number) => `/collections/${id}/reject`,
  autoApprove: (id: number) => `/collections/${id}/auto-approve`,
  audits: (id: number) => `/collections/${id}/audits`,
};

// ---------- tiny styles ----------
const pageBg: React.CSSProperties = {
  minHeight: "100vh",
  padding: 16,
  background: "radial-gradient(1200px 700px at 70% 0%, rgba(20, 184, 166, 0.12), transparent 55%), radial-gradient(1000px 600px at 10% 40%, rgba(59, 130, 246, 0.12), transparent 50%), #0B1220",
  color: "white",
};

const panel: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.18)",
  color: "white",
  outline: "none",
};

const pillBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const actionBtn = (tone: "green" | "red" | "gray"): React.CSSProperties => {
  const t =
    tone === "green"
      ? { bg: "rgba(34,197,94,0.16)", bd: "rgba(34,197,94,0.25)", fg: "rgba(209,250,229,0.95)" }
      : tone === "red"
      ? { bg: "rgba(239,68,68,0.16)", bd: "rgba(239,68,68,0.25)", fg: "rgba(254,226,226,0.95)" }
      : { bg: "rgba(255,255,255,0.05)", bd: "rgba(255,255,255,0.12)", fg: "rgba(255,255,255,0.90)" };

  return {
    padding: "12px 18px",
    borderRadius: 999,
    border: `1px solid ${t.bd}`,
    background: t.bg,
    color: t.fg,
    fontWeight: 900,
    cursor: "pointer",
  };
};

export default function CollectionsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "ALL">("ALL");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // UI filters
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [hideDone, setHideDone] = useState(true);

  // view mode
  const [viewMode, setViewMode] = useState<ViewMode>("EXEC");

  // role + permissions
  const role = useMemo(() => getCurrentRole(), []);
  const roleUpper = useMemo(() => asUpper(role), [role]);

  // View lock: only ADMIN can switch to OPS
  const canSwitchToOps = useMemo(() => roleUpper === "ADMIN", [roleUpper]);

  // who can click actions
  const canPerformOpsActions = useMemo(() => {
    return ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "OPERATOR", "SUPER_ADMIN"].includes(roleUpper);
  }, [roleUpper]);

  const selected = useMemo(() => {
    if (selectedId == null) return null;
    return collections.find((c) => c.id === selectedId) ?? null;
  }, [collections, selectedId]);

  async function loadCompanies() {
    try {
      const res = await api.get(ENDPOINTS.companies);
      const list = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setCompanies(list);
    } catch {
      setCompanies([]);
    }
  }

  async function loadCollections() {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (companyId !== "ALL") params.companyId = companyId;

      const res = await api.get(ENDPOINTS.collections, { params });
      const list = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setCollections(list);

      // auto-select first if none selected
      if (selectedId == null && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load collections");
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditsFor(id: number) {
    try {
      const res = await api.get(ENDPOINTS.audits(id));
      const list = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, audits: list } : c)));
    } catch {
      // optional
    }
  }

  useEffect(() => {
    loadCompanies();
    loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (selectedId != null) loadAuditsFor(selectedId);
     
  }, [selectedId]);

  const { showToast } = useToast();

  function setMode(next: ViewMode) {
    if (next === "OPS" && !canSwitchToOps) {
      showToast("Ops View is locked. Only ADMIN can switch to Ops View.", "error");
      setViewMode("EXEC");
      return;
    }
    setViewMode(next);
  }

  async function doApprove(id: number) {
    if (!canPerformOpsActions) {
      showToast("You don't have permission to approve.", "error");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post(ENDPOINTS.approve(id), {});
      await loadCollections();
      await loadAuditsFor(id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Approve failed");
    } finally {
      setLoading(false);
    }
  }

  async function doReject(id: number) {
    if (!canPerformOpsActions) {
      showToast("You don't have permission to reject.", "error");
      return;
    }
    const reason = window.prompt("Reject reason (optional):", "") ?? "";
    setLoading(true);
    setError(null);
    try {
      await api.post(ENDPOINTS.reject(id), { reason: reason.trim() || undefined });
      await loadCollections();
      await loadAuditsFor(id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Reject failed");
    } finally {
      setLoading(false);
    }
  }

  async function doAutoApprove(id: number) {
    if (!canPerformOpsActions) {
      showToast("You don't have permission to auto-approve.", "error");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post(ENDPOINTS.autoApprove(id), {});
      await loadCollections();
      await loadAuditsFor(id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Auto-approve failed");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = collections;

    // local filter fallback
    if (companyId !== "ALL") {
      list = list.filter((c) => c.companyId === companyId || c.company?.id === companyId);
    }

    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter((c) => {
        const idMatch = String(c.id).includes(s);
        const nameMatch = (c.name || "").toLowerCase().includes(s);
        return idMatch || nameMatch;
      });
    }

    if (pendingOnly) {
      list = list.filter((c) => asUpper(c.approvalStatus) === "PENDING");
    }

    if (hideDone) {
      list = list.filter((c) => {
        const st = asUpper(c.status);
        return st !== "COMPLETED" && st !== "CANCELLED";
      });
    }

    return list;
  }, [collections, companyId, search, pendingOnly, hideDone]);

  const showingText = useMemo(() => {
    return `Showing ${filtered.length} of ${collections.length}`;
  }, [filtered.length, collections.length]);

  const isSelectedApprovalPending = useMemo(() => {
    if (!selected) return false;
    return asUpper(selected.approvalStatus) === "PENDING";
  }, [selected]);

  // ✅ THIS is the correct condition for showing approval buttons:
  const showApprovalActions = useMemo(() => {
    return viewMode === "OPS" && isSelectedApprovalPending && canPerformOpsActions;
  }, [viewMode, isSelectedApprovalPending, canPerformOpsActions]);

  return (
    <div style={pageBg}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1.35fr", gap: 14 }}>
          {/* LEFT */}
          <div style={{ ...panel, padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 8, opacity: 0.9 }}>Company</div>
                <select
                  value={companyId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompanyId(v === "ALL" ? "ALL" : Number(v));
                  }}
                  style={input}
                >
                  <option value="ALL">All companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 900, marginBottom: 8, opacity: 0.9 }}>Search</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or id..."
                  style={input}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, opacity: 0.92 }}>
                <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                Pending approval only
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, opacity: 0.92 }}>
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                Hide completed/cancelled
              </label>

              <div style={{ marginLeft: "auto", opacity: 0.7, fontWeight: 800 }}>{showingText}</div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                style={{
                  ...pillBtn,
                  background: viewMode === "EXEC" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                }}
                onClick={() => setMode("EXEC")}
              >
                Executive View
              </button>

              <button
                style={{
                  ...pillBtn,
                  opacity: canSwitchToOps ? 1 : 0.5,
                  cursor: canSwitchToOps ? "pointer" : "not-allowed",
                  background: viewMode === "OPS" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                }}
                disabled={!canSwitchToOps}
                title={!canSwitchToOps ? "Ops View locked (ADMIN only)" : "Ops View"}
                onClick={() => setMode("OPS")}
              >
                Ops View
              </button>

              <button style={{ ...pillBtn, marginLeft: "auto" }} onClick={loadCollections} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {!canSwitchToOps && (
              <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 800 }}>
                Ops View locked. Only <b>ADMIN</b> can switch.
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(239,68,68,0.25)",
                  background: "rgba(239,68,68,0.10)",
                  color: "rgba(254,226,226,0.95)",
                  fontWeight: 800,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map((c) => {
                const isSelected = c.id === selectedId;
                const risk = typeof c.aiRiskScore === "number" ? clamp(Math.round(c.aiRiskScore), 0, 100) : null;
                const conf =
                  typeof c.aiConfidence === "number"
                    ? clamp(Math.round(c.aiConfidence * 100), 0, 100)
                    : null;

                const status = asUpper(c.status);
                const approval = asUpper(c.approvalStatus);

                const b1 = badgeColor(statusKind(status) as any);
                const b2 = badgeColor(approvalKind(approval) as any);

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      borderRadius: 18,
                      padding: 14,
                      border: `1px solid ${isSelected ? "rgba(59,130,246,0.40)" : "rgba(255,255,255,0.10)"}`,
                      background: isSelected ? "rgba(59,130,246,0.10)" : "rgba(255,255,255,0.03)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 950, lineHeight: 1.1 }}>
                          {c.name}
                        </div>
                        <div style={{ marginTop: 6, opacity: 0.8, fontWeight: 800, fontSize: 13 }}>
                          #{c.id} • Status <b>{status}</b> • Approval <b>{approval}</b> • Created{" "}
                          {formatDate(c.createdAt)}
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "6px 12px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(0,0,0,0.16)",
                              fontWeight: 900,
                              opacity: 0.92,
                            }}
                          >
                            Ops Hint: <span style={{ opacity: 0.9 }}>Open to action →</span>
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth: 220,
                          borderRadius: 16,
                          padding: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.18)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 950, fontSize: 18 }}>{riskLabel(risk)}</div>
                          <div style={{ opacity: 0.85, fontWeight: 900, fontSize: 13 }}>
                            {risk == null ? "—" : `${risk}/100`} • {conf == null ? "—" : `${conf}%`}
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: 10,
                            height: 8,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.08)",
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ width: `${risk ?? 0}%`, height: "100%", background: "rgba(20,184,166,0.65)" }} />
                        </div>
                        <div style={{ marginTop: 10, opacity: 0.65, fontWeight: 800, fontSize: 12 }}>
                          {c.aiScoredAt ? `Scored ${formatDate(c.aiScoredAt)}` : "Not scored yet"}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 999, background: b1.bg, color: b1.fg, border: `1px solid ${b1.bd}`, fontWeight: 900 }}>
                        {status}
                      </span>
                      <span style={{ padding: "4px 10px", borderRadius: 999, background: b2.bg, color: b2.fg, border: `1px solid ${b2.bd}`, fontWeight: 900 }}>
                        {approval}
                      </span>
                    </div>
                  </div>
                );
              })}

              {!loading && filtered.length === 0 && (
                <div style={{ opacity: 0.75, fontWeight: 800, padding: 14 }}>
                  No collections match your filters.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ ...panel, padding: 14 }}>
            {!selected ? (
              <div style={{ opacity: 0.75, fontWeight: 800 }}>Select a collection.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 1000, lineHeight: 1.05 }}>{selected.name}</div>
                    <div style={{ marginTop: 6, opacity: 0.85, fontWeight: 900, fontSize: 16 }}>
                      #{selected.id} • Status <b>{asUpper(selected.status)}</b> • Approval{" "}
                      <b>{asUpper(selected.approvalStatus)}</b>
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.6, fontWeight: 800 }}>
                      Created {formatDate(selected.createdAt)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button style={pillBtn} onClick={() => loadAuditsFor(selected.id)}>
                      AI Score
                    </button>
                    <button
                      style={{ ...pillBtn, opacity: viewMode === "OPS" ? 1 : 0.5 }}
                      disabled={viewMode !== "OPS"}
                      onClick={() => doAutoApprove(selected.id)}
                      title={viewMode !== "OPS" ? "Switch to Ops View to use auto-approve" : "Auto-approve"}
                    >
                      Auto-Approve
                    </button>
                  </div>
                </div>

                {/* AI panel */}
                <div style={{ marginTop: 14, borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.16)", padding: 14 }}>
                  <div style={{ fontSize: 20, fontWeight: 1000 }}>AI Approval Copilot</div>
                  <div style={{ marginTop: 4, opacity: 0.75, fontWeight: 800 }}>
                    Explainable risk scoring (free) • Guardrails-ready
                  </div>

                  <div style={{ marginTop: 12, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${clamp(Math.round(selected.aiRiskScore ?? 0), 0, 100)}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, rgba(59,130,246,0.65), rgba(20,184,166,0.65))",
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, marginTop: 14 }}>
                    <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12 }}>
                      <div style={{ fontWeight: 1000, fontSize: 16 }}>Explanation</div>
                      <div style={{ marginTop: 10, opacity: 0.88, fontWeight: 800, lineHeight: 1.35 }}>
                        {selected.aiExplanation || "No explanation available yet."}
                      </div>
                      <div style={{ marginTop: 12, opacity: 0.65, fontWeight: 800, fontSize: 12 }}>
                        Last scored: {selected.aiScoredAt ? formatDate(selected.aiScoredAt) : "Not scored yet"}
                      </div>
                    </div>

                    <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12 }}>
                      <div style={{ fontWeight: 1000, fontSize: 16 }}>Risk flags</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                        {(selected.aiRiskFlags || []).length === 0 ? (
                          <div style={{ opacity: 0.7, fontWeight: 800 }}>None</div>
                        ) : (
                          (selected.aiRiskFlags || []).map((f) => (
                            <span
                              key={f}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 999,
                                border: "1px solid rgba(59,130,246,0.22)",
                                background: "rgba(59,130,246,0.12)",
                                fontWeight: 1000,
                                opacity: 0.95,
                              }}
                            >
                              {f}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ✅ FIXED: approval actions use approvalStatus, NOT status */}
                  <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {showApprovalActions ? (
                      <>
                        <button style={actionBtn("green")} disabled={loading} onClick={() => doApprove(selected.id)}>
                          Approve
                        </button>
                        <button style={actionBtn("red")} disabled={loading} onClick={() => doReject(selected.id)}>
                          Reject
                        </button>
                      </>
                    ) : (
                      <div style={{ opacity: 0.7, fontWeight: 900 }}>
                        {viewMode !== "OPS"
                          ? "Switch to Ops View to take action."
                          : !isSelectedApprovalPending
                          ? "No actions available: approval is not PENDING."
                          : !canPerformOpsActions
                          ? "You do not have permission to approve/reject."
                          : "No actions available."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit trail */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>Audit Trail</div>

                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                    {(selected.audits || []).length === 0 ? (
                      <div style={{ opacity: 0.7, fontWeight: 800 }}>No audit entries.</div>
                    ) : (
                      (selected.audits || []).map((a) => (
                        <div
                          key={a.id}
                          style={{
                            borderRadius: 16,
                            padding: 12,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 1000 }}>{a.action}</div>
                            <div style={{ opacity: 0.65, fontWeight: 800, fontSize: 12 }}>{formatDate(a.createdAt)}</div>
                          </div>
                          <div style={{ marginTop: 8, opacity: 0.85, fontWeight: 800, fontSize: 13, lineHeight: 1.35 }}>
                            {a.actorEmail && (
                              <div>
                                <b>Actor:</b> {a.actorEmail}{" "}
                                {a.actorRole ? <span style={{ opacity: 0.7 }}>({a.actorRole})</span> : null}
                              </div>
                            )}
                            {a.reason && (
                              <div>
                                <b>Reason:</b> {a.reason}
                              </div>
                            )}
                            {(a.aiRiskScore != null || a.aiConfidence != null || a.aiExplanation) && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontWeight: 1000, fontSize: 12, opacity: 0.9 }}>AI Context</div>
                                {a.aiRiskScore != null && (
                                  <div>
                                    <b>Risk:</b> {Math.round(a.aiRiskScore)}
                                  </div>
                                )}
                                {a.aiConfidence != null && (
                                  <div>
                                    <b>Confidence:</b> {Math.round(a.aiConfidence * 100)}%
                                  </div>
                                )}
                                {a.aiExplanation && <div style={{ marginTop: 4, opacity: 0.9 }}>{a.aiExplanation}</div>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14, opacity: 0.65, fontWeight: 800, fontSize: 12 }}>
          Role detected: <b>{roleUpper || "UNKNOWN"}</b>
        </div>
      </div>
    </div>
  );
}
