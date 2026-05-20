import React from "react";
import AIOpsCopilot from "../components/AIOpsCopilot";

export default function Warehouse() {
  const context = {
    note: "Warehouse page context. Wire inventory zones + scans here next.",
    zones: [],
    aging: [],
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        <div style={card()}>
          <h2 style={{ marginTop: 0 }}>Warehousing</h2>
          <div style={{ color: "#6b7280" }}>
            Next: AI flags capacity risk, missing scans, aging parcels, and suggests re-slotting.
          </div>
        </div>

        <AIOpsCopilot domain="warehouse" title="Warehouse AI Copilot" context={context} />
      </div>
    </div>
  );
}

function card() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 } as const;
}
