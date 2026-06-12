import React, { useMemo, useState } from "react";
import axios from "axios";

type Company = { id: number; name: string };
type Collection = { id: number; name: string; status?: string; createdAt?: string };

type CopilotAction =
  | { type: "SET_COMPANY"; payload: { companyId: number } }
  | { type: "APPLY_FILTERS"; payload: { status?: string; search?: string } }
  | { type: "REFRESH_COLLECTIONS"; payload?: {} }
  | { type: "NAVIGATE"; payload: { to: string } };

type CopilotResponse = {
  summary: string;
  insights: string[];
  suggestedFilters: { status?: string; search?: string };
  actions: { label: string; action: CopilotAction }[];
};

import { FLOWOPS_API_URL } from "../lib/env";
import { getAccessToken } from "../lib/session";

const API_BASE = FLOWOPS_API_URL;

function getToken(): string {
  return getAccessToken() ?? "";
}

export default function CollectionsAICopilot(props: {
  companies: Company[];
  collections: Collection[];
  selectedCompanyId: number | "";
  onSetCompany: (id: number) => void;
  onApplyFilters: (filters: { status?: string; search?: string }) => void;
  onRefresh: () => void;
}) {
  const { companies, collections, selectedCompanyId, onSetCompany, onApplyFilters, onRefresh } = props;

  const [question, setQuestion] = useState("Why are no collections showing?");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resp, setResp] = useState<CopilotResponse | null>(null);

  const canRun = useMemo(() => !!getToken(), []);

  async function ask() {
    setError("");
    setLoading(true);

    try {
      const token = getToken();
      const res = await axios.post(
        `${API_BASE}/ai/collections-copilot`,
        {
          question,
          selectedCompanyId: selectedCompanyId === "" ? null : selectedCompanyId,
          companies,
          collections,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setResp(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Copilot request failed";
      setError(String(msg));
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  function runAction(a: CopilotAction) {
    if (a.type === "SET_COMPANY") onSetCompany(a.payload.companyId);
    else if (a.type === "APPLY_FILTERS") onApplyFilters(a.payload);
    else if (a.type === "REFRESH_COLLECTIONS") onRefresh();
    else if (a.type === "NAVIGATE") window.location.assign(a.payload.to);
  }

  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>AI Ops Copilot</div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
          Uses live collections data
        </div>
      </div>

      {!canRun && (
        <div style={warn()}>
          No <code>access_token</code> found. Please login first.
        </div>
      )}

      {error && <div style={err()}>{error}</div>}

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        style={textarea()}
        placeholder='Ask: "Summarize today", "Show overdue", "Why empty", "Suggest next actions"...'
      />

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button style={btn("primary")} disabled={!canRun || loading} onClick={ask}>
          {loading ? "Thinking..." : "Ask Copilot"}
        </button>
        <button style={btn()} disabled={loading} onClick={() => setResp(null)}>
          Clear
        </button>
      </div>

      {resp && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Summary</div>
          <div style={{ color: "#111827", marginBottom: 12 }}>{resp.summary}</div>

          {resp.insights?.length > 0 && (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Insights</div>
              <ul style={{ marginTop: 0, color: "#374151" }}>
                {resp.insights.map((x, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {x}
                  </li>
                ))}
              </ul>
            </>
          )}

          {resp.actions?.length > 0 && (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Suggested actions</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {resp.actions.map((a, i) => (
                  <button key={i} style={btn()} onClick={() => runAction(a.action)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* tiny styles */
function card() {
  return {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 14,
  } as const;
}
function textarea() {
  return {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: 12,
    resize: "vertical" as const,
    fontSize: 14,
  };
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
    fontWeight: 700,
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
    fontWeight: 700,
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
    fontWeight: 700,
  } as const;
}