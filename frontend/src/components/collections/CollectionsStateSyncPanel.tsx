import React, { useEffect, useMemo, useState } from "react";
import {
  fetchCollectionsSyncDashboard,
  fetchCollectionsSyncRecords,
  fetchSuggestedDriver,
  runCollectionsBulkSync,
  syncSingleCollection,
} from "../../services/collectionsStateSync";

type SyncRecord = {
  collectionId: string;
  reference?: string;
  customerName?: string;
  destination?: string;
  status?: string;
  shipmentStatus?: string;
  dispatchStatus?: string;
  podStatus?: string;
  invoiceStatus?: string;
  shipmentLinked?: boolean;
  dispatchLinked?: boolean;
  podLinked?: boolean;
  invoiceLinked?: boolean;
  driverAssigned?: boolean;
  driverName?: string | null;
  syncHealth?: string;
  aiFlags?: string[];
  aiPriority?: string;
  lastUpdatedAt?: string;
};

type DashboardData = {
  totals?: Record<string, number>;
  moduleHealth?: Record<string, number>;
  records?: SyncRecord[];
};

const shellStyle: React.CSSProperties = {
  marginTop: 20,
  marginBottom: 20,
  padding: 18,
  borderRadius: 20,
  border: "1px solid rgba(99, 102, 241, 0.18)",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.95), rgba(49,46,129,0.90))",
  boxShadow: "0 24px 60px rgba(2,6,23,0.24)",
  color: "#e2e8f0",
};

const titleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: 0,
  letterSpacing: "0.02em",
};

const subtitleStyle: React.CSSProperties = {
  margin: "6px 0 0 0",
  opacity: 0.8,
  fontSize: 13,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  background: "linear-gradient(135deg, #818cf8, #38bdf8)",
  color: "#0f172a",
};

const ghostButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "rgba(255,255,255,0.08)",
  color: "#e2e8f0",
  border: "1px solid rgba(255,255,255,0.12)",
};

const cardsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const statCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.78,
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1.1,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "6px 0 12px 0",
  fontSize: 16,
  fontWeight: 800,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
  background: "rgba(255,255,255,0.04)",
};

const thtdBase: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  verticalAlign: "top",
  fontSize: 13,
};

const badgeBase: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 11,
  marginRight: 6,
  marginBottom: 6,
};

function badgeStyle(type: string): React.CSSProperties {
  const normalized = String(type || "").toUpperCase();
  if (normalized.includes("HIGH")) {
    return { ...badgeBase, background: "rgba(248,113,113,0.18)", color: "#fecaca" };
  }
  if (normalized.includes("SYNCED")) {
    return { ...badgeBase, background: "rgba(34,197,94,0.18)", color: "#bbf7d0" };
  }
  if (normalized.includes("PARTIAL")) {
    return { ...badgeBase, background: "rgba(250,204,21,0.18)", color: "#fde68a" };
  }
  if (
    normalized.includes("DELAY") ||
    normalized.includes("MISMATCH") ||
    normalized.includes("OVERLOAD") ||
    normalized.includes("UNASSIGNED") ||
    normalized.includes("BROKEN")
  ) {
    return { ...badgeBase, background: "rgba(251,146,60,0.18)", color: "#fdba74" };
  }
  return { ...badgeBase, background: "rgba(148,163,184,0.18)", color: "#e2e8f0" };
}

function niceText(value: unknown, fallback = "—") {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function CollectionsStateSyncPanel() {
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [driverLoadingId, setDriverLoadingId] = useState("");
  const [driverSuggestions, setDriverSuggestions] = useState<Record<string, string>>({});

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [dashboardData, recordsData] = await Promise.all([
        fetchCollectionsSyncDashboard(),
        fetchCollectionsSyncRecords(),
      ]);
      setDashboard(dashboardData || {});
      setRecords(Array.isArray(recordsData) ? recordsData : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load collections state sync data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleBulkSync() {
    setSyncing(true);
    setError("");
    try {
      await runCollectionsBulkSync("collections-command-center");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Bulk sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncOne(collectionId: string) {
    setSyncing(true);
    setError("");
    try {
      await syncSingleCollection(collectionId, "collections-command-center");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || `Sync failed for ${collectionId}.`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSuggestDriver(collectionId: string) {
    setDriverLoadingId(collectionId);
    setError("");
    try {
      const result = await fetchSuggestedDriver(collectionId);
      const text = result?.suggestion
        ? `${result.suggestion.name} • ${result.suggestion.vehicleType} • score ${result.suggestion.score}`
        : "No driver suggestion available";
      setDriverSuggestions((prev) => ({ ...prev, [collectionId]: text }));
    } catch (err: any) {
      setError(err?.message || `Failed to suggest driver for ${collectionId}.`);
    } finally {
      setDriverLoadingId("");
    }
  }

  const totals = dashboard?.totals || {};
  const headerCards = useMemo(
    () => [
      { label: "Collections", value: totals.collections || 0 },
      { label: "Fully Synced", value: totals.fullySynced || 0 },
      { label: "Partial Sync", value: totals.partial || 0 },
      { label: "Broken Sync", value: totals.broken || 0 },
      { label: "Pending Assignment", value: totals.pendingAssignment || 0 },
      { label: "Delay Risk", value: totals.delayed || 0 },
      { label: "Driver Overload", value: totals.overloadRisk || 0 },
      { label: "Billing Mismatch", value: totals.billingMismatch || 0 },
    ],
    [totals],
  );

  return (
    <section style={shellStyle}>
      <div style={titleRowStyle}>
        <div>
          <h2 style={titleStyle}>Collections State Sync + AI Supervision</h2>
          <p style={subtitleStyle}>
            Live bridge across shipments, dispatch, POD, invoices, and smart driver supervision.
          </p>
        </div>

        <div style={buttonRowStyle}>
          <button style={ghostButtonStyle} onClick={loadAll} disabled={loading || syncing}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button style={buttonStyle} onClick={handleBulkSync} disabled={loading || syncing}>
            {syncing ? "Syncing..." : "Run Bulk Sync"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            background: "rgba(239,68,68,0.14)",
            border: "1px solid rgba(239,68,68,0.24)",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={cardsGridStyle}>
        {headerCards.map((card) => (
          <div key={card.label} style={statCardStyle}>
            <div style={statLabelStyle}>{card.label}</div>
            <div style={statValueStyle}>{card.value}</div>
          </div>
        ))}
      </div>

      <h3 style={sectionTitleStyle}>Live Sync Records</h3>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thtdBase}>Collection</th>
              <th style={thtdBase}>Customer</th>
              <th style={thtdBase}>Status Flow</th>
              <th style={thtdBase}>Driver</th>
              <th style={thtdBase}>AI Flags</th>
              <th style={thtdBase}>Health</th>
              <th style={thtdBase}>Updated</th>
              <th style={thtdBase}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.collectionId}>
                <td style={thtdBase}>
                  <div style={{ fontWeight: 800 }}>{niceText(row.reference || row.collectionId)}</div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>{niceText(row.destination)}</div>
                </td>

                <td style={thtdBase}>
                  <div>{niceText(row.customerName)}</div>
                </td>

                <td style={thtdBase}>
                  <div style={badgeStyle(row.status || "")}>{niceText(row.status)}</div>
                  <div style={badgeStyle(row.shipmentStatus || "")}>Shipment: {niceText(row.shipmentStatus)}</div>
                  <div style={badgeStyle(row.dispatchStatus || "")}>Dispatch: {niceText(row.dispatchStatus)}</div>
                  <div style={badgeStyle(row.podStatus || "")}>POD: {niceText(row.podStatus)}</div>
                  <div style={badgeStyle(row.invoiceStatus || "")}>Invoice: {niceText(row.invoiceStatus)}</div>
                </td>

                <td style={thtdBase}>
                  <div>{row.driverAssigned ? niceText(row.driverName, "Assigned") : "Unassigned"}</div>
                  <div style={{ opacity: 0.75, marginTop: 6 }}>
                    {driverSuggestions[row.collectionId] || "No suggestion loaded"}
                  </div>
                </td>

                <td style={thtdBase}>
                  {(row.aiFlags || []).length ? (
                    (row.aiFlags || []).map((flag) => (
                      <span key={flag} style={badgeStyle(flag)}>
                        {niceText(flag)}
                      </span>
                    ))
                  ) : (
                    <span style={badgeStyle("SYNCED")}>Clean</span>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <span style={badgeStyle(row.aiPriority || "NORMAL")}>
                      Priority: {niceText(row.aiPriority || "NORMAL")}
                    </span>
                  </div>
                </td>

                <td style={thtdBase}>
                  <div style={badgeStyle(row.syncHealth || "")}>{niceText(row.syncHealth)}</div>
                  <div style={{ opacity: 0.78, marginTop: 8 }}>
                    Ship {row.shipmentLinked ? "✓" : "✕"} | Dispatch {row.dispatchLinked ? "✓" : "✕"} | POD{" "}
                    {row.podLinked ? "✓" : "✕"} | Invoice {row.invoiceLinked ? "✓" : "✕"}
                  </div>
                </td>

                <td style={thtdBase}>{formatDate(row.lastUpdatedAt)}</td>

                <td style={thtdBase}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={buttonStyle}
                      onClick={() => handleSyncOne(row.collectionId)}
                      disabled={syncing}
                    >
                      Sync Now
                    </button>

                    <button
                      style={ghostButtonStyle}
                      onClick={() => handleSuggestDriver(row.collectionId)}
                      disabled={!!driverLoadingId}
                    >
                      {driverLoadingId === row.collectionId ? "Thinking..." : "Suggest Driver"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && records.length === 0 ? (
              <tr>
                <td style={thtdBase} colSpan={8}>
                  No collections found in the state sync layer yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
