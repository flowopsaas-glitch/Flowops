import React, { useMemo, useState } from "react";
import axios from "axios";
import { FLOWOPS_API_URL } from "../lib/env";

const API_BASE = FLOWOPS_API_URL;

import { getAccessToken } from "../lib/session";

function getToken(): string {
  return getAccessToken() ?? "";
}

type Props = {
  domain: "dispatch" | "sales" | "warehouse" | "collections" | "invoices" | "drivers";
  title?: string;
  context: any;
  onAction?: (action: any) => Promise<void> | void;
};

export default function AIOpsCopilot({ domain, title, context, onAction }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<any>(null);

  const token = useMemo(() => getToken(), []);

  async function ask() {
    setError("");
    setBusy(true);
    try {
      // Backend contract: POST /ai-ops/assist reads `query` and returns
      // { success, data: { reply } } (wrapped again by the TransformInterceptor).
      // Include the domain + context inline so the model has the operating
      // context, but the field the backend actually reads is `query`.
      const prompt = context
        ? `[${domain}] ${input}\n\nContext: ${JSON.stringify(context)}`
        : `[${domain}] ${input}`;
      const res = await axios.post(
        `${API_BASE}/ai-ops/assist`,
        { query: prompt },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      // Unwrap the TransformInterceptor envelope, then the handler's { success, data }.
      const body = res.data?.data ?? res.data;
      const reply = body?.reply ?? body?.data?.reply ?? "";
      setLast({ summary: reply });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "AI request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card()}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>{title || "AI Copilot"}</div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
          Domain: <b>{domain}</b>
        </div>
      </div>

      {!token && (
        <div style={warn()}>
          No token found. Please login first. AI requires authentication.
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <textarea
          rows={4}
          style={textarea()}
          placeholder={`Ask AI about ${domain}… e.g. "What should I do next?"`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button style={btn("primary")} onClick={ask} disabled={busy || !input.trim()}>
          {busy ? "Thinking..." : "Ask Copilot"}
        </button>
      </div>

      {error && <div style={err()}>{error}</div>}

      {last && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Answer</div>
          <div style={{ color: "#111827", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {last.summary || "No response returned."}
          </div>
        </div>
      )}
    </div>
  );
}

function card() {
  return {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 14,
  } as const;
}
function btn(kind?: "primary") {
  const primary = kind === "primary";
  return {
    width: "100%",
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 10,
    border: primary ? "1px solid #0f2e6e" : "1px solid #e5e7eb",
    background: primary ? "#0f2e6e" : "#ffffff",
    color: primary ? "#ffffff" : "#111827",
    cursor: "pointer",
    fontWeight: 800,
    textAlign: "center" as const,
  };
}
function textarea() {
  return { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 } as const;
}
function err() {
  return { marginTop: 10, background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", padding: 10, borderRadius: 12, fontWeight: 800 } as const;
}
function warn() {
  return { marginTop: 10, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: 10, borderRadius: 12, fontWeight: 800 } as const;
}