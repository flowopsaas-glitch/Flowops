import React from "react";
import AIOpsCopilot from "../components/AIOpsCopilot";

export default function Sales() {
  const context = {
    note: "Sales page context. Wire customers, quotes, revenue here next.",
    customers: [],
    quotes: [],
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        <div style={card()}>
          <h2 style={{ marginTop: 0 }}>Sales</h2>
          <div style={{ color: "#6b7280" }}>
            Next: AI detects inactive clients, suggests follow-ups, drafts quotes, and flags underpricing.
          </div>
        </div>

        <AIOpsCopilot domain="sales" title="Sales AI Copilot" context={context} />
      </div>
    </div>
  );
}

function card() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 } as const;
}
