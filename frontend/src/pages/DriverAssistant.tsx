import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from '../api/client';

function getToken(): string {
  // Support both keys to avoid mismatch
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

export default function DriverAssistant() {
  const nav = useNavigate();

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedCollectionId, setSelectedCollectionId] = useState<number | "">("");
  const [parcelsJson, setParcelsJson] = useState<string>(
    JSON.stringify(
      [
        { tracking: "PKG-001", description: "Box", qty: 1 },
        { tracking: "PKG-002", description: "Envelope", qty: 1 },
      ],
      null,
      2
    )
  );
  const [files, setFiles] = useState<FileList | null>(null);

  const token = getToken();
  const canRun = useMemo(() => !!token, [token]);

  async function refresh() {
    setError("");
    setLoading(true);

    try {
      // ✅ api client automatically attaches Authorization: Bearer <token>
      const res = await api.get(`/driver-assistant/dashboard`);

      setData(res.data);

      const first = res.data?.pendingCollections?.[0]?.id;
      if (first && selectedCollectionId === "") setSelectedCollectionId(first);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.message || "Failed to load dashboard";

      if (status === 401) {
        setError("Unauthorized (token missing/expired). Redirecting to login...");
        setTimeout(() => nav("/login"), 600);
      } else {
        setError(String(msg));
      }
    } finally {
      setLoading(false);
    }
  }

  async function upload() {
    setError("");
    if (!selectedCollectionId) return setError("Select a collection first.");

    try {
      const fd = new FormData();
      fd.append("parcelsJson", parcelsJson);

      if (files?.length) {
        for (let i = 0; i < files.length; i++) {
          fd.append("files", files[i]);
        }
      }

      // ✅ api client attaches token; we only need multipart header
      await api.post(`/driver-assistant/collections/${selectedCollectionId}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await refresh();
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.message || "Upload failed";

      if (status === 401) {
        setError("Unauthorized. Redirecting to login...");
        setTimeout(() => nav("/login"), 600);
      } else {
        setError(String(msg));
      }
    }
  }

  async function markReady() {
    setError("");
    if (!selectedCollectionId) return setError("Select a collection first.");

    try {
      await api.post(`/driver-assistant/collections/${selectedCollectionId}/ready`, {});
      await refresh();
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.message || "Mark ready failed";

      if (status === 401) {
        setError("Unauthorized. Redirecting to login...");
        setTimeout(() => nav("/login"), 600);
      } else {
        setError(String(msg));
      }
    }
  }

  useEffect(() => {
    if (!getToken()) return; // don’t spam dashboard if not logged in
    refresh();

    const t = setInterval(() => {
      if (getToken()) refresh();
    }, 30_000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Driver Assistant</h2>

        <button style={btn("primary")} onClick={refresh} disabled={!canRun || loading}>
          {loading ? "Monitoring..." : "Refresh"}
        </button>

        <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 12 }}>
          Auto-monitoring every 30s
        </div>
      </div>

      {!canRun && (
        <div style={warn()}>
          No token found. Please <b>log in</b> first.{" "}
          <button style={btn("primary")} onClick={() => nav("/login")}>
            Go to Login
          </button>
        </div>
      )}

      {error && <div style={err()}>{error}</div>}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16 }}>
          {/* LEFT: prompts + advice */}
          <div style={card()}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Live Ops</div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
                Close in: {data.minutesToClose} min
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800 }}>Prompts</div>
              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                {(data.prompts || []).map((p: any, i: number) => (
                  <div key={i} style={promptBox(p.level)}>
                    <div style={{ fontWeight: 900 }}>{p.title}</div>
                    <div style={{ marginTop: 6 }}>{p.message}</div>
                  </div>
                ))}
              </div>
            </div>

            {data.aiRouteAdvice && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900 }}>AI Route Advice</div>
                <div style={{ marginTop: 6 }}>{data.aiRouteAdvice.summary}</div>

                <div style={{ marginTop: 10, fontWeight: 800 }}>Suggested order</div>
                <ol style={{ marginTop: 6 }}>
                  {(data.aiRouteAdvice.orderedStops || []).map((s: any, idx: number) => (
                    <li key={idx}>
                      Collection #{s.collectionId} — {s.reason}
                    </li>
                  ))}
                </ol>

                {Array.isArray(data.aiRouteAdvice.tips) && data.aiRouteAdvice.tips.length > 0 && (
                  <>
                    <div style={{ marginTop: 10, fontWeight: 800 }}>Tips</div>
                    <ul style={{ marginTop: 6 }}>
                      {data.aiRouteAdvice.tips.map((t: string, idx: number) => (
                        <li key={idx}>{t}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: upload enforcement */}
          <div style={card()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Complete a Pending Collection</div>

            <label style={label()}>Select pending collection</label>
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value ? Number(e.target.value) : "")}
              style={select()}
            >
              <option value="">Select...</option>
              {(data.pendingCollections || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  #{c.id} — {c.name}
                </option>
              ))}
            </select>

            <label style={label()}>Parcels JSON (required for invoicing)</label>
            <textarea rows={8} style={textarea()} value={parcelsJson} onChange={(e) => setParcelsJson(e.target.value)} />

            <label style={label()}>POD uploads (photos/files)</label>
            <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button style={btn("primary")} onClick={upload} disabled={!selectedCollectionId}>
                Upload parcels + PODs
              </button>
              <button style={btn()} onClick={markReady} disabled={!selectedCollectionId}>
                Mark READY for invoicing
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
              Mark READY requires both: <b>parcels list</b> and <b>POD files</b>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* styles */
function card() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 } as const;
}
function btn(kind?: "primary") {
  const primary = kind === "primary";
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: primary ? "1px solid #0f2e6e" : "1px solid #e5e7eb",
    background: primary ? "#0f2e6e" : "#ffffff",
    color: primary ? "#ffffff" : "#111827",
    cursor: "pointer",
    fontWeight: 800,
  } as const;
}
function err() {
  return {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#9f1239",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    fontWeight: 800,
  } as const;
}
function warn() {
  return {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    fontWeight: 800,
  } as const;
}
function label() {
  return { display: "block", fontWeight: 800, marginTop: 10, marginBottom: 6 } as const;
}
function select() {
  return { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" } as const;
}
function textarea() {
  return { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 } as const;
}
function promptBox(level: string) {
  const l = String(level).toUpperCase();
  if (l === "URGENT") return { border: "1px solid #fecaca", background: "#fff1f2", padding: 12, borderRadius: 12 } as const;
  if (l === "WARNING") return { border: "1px solid #fde68a", background: "#fffbeb", padding: 12, borderRadius: 12 } as const;
  return { border: "1px solid #e5e7eb", background: "#f9fafb", padding: 12, borderRadius: 12 } as const;
}
