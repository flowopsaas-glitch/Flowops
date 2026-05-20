import React from "react";
import AIOpsCopilot from "../components/AIOpsCopilot";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
export default function Dispatch() {
  const context = {
    note: "Dispatch page context. Wire real dispatch list here next.",
    dispatches: [],
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        <div style={card()}>
          <h2 style={{ marginTop: 0 }}>Dispatch</h2>
          <div style={{ color: "#6b7280" }}>
            Next: load dispatch list + assignments and let AI recommend driver allocation + route priority.
          </div>
        </div>

        <AIOpsCopilot domain="dispatch" title="Dispatch AI Copilot" context={context} />
      </div>
    </div>
  );
}

function card() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 } as const;
}
