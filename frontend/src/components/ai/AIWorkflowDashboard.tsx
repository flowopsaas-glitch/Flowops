import React, { useEffect, useState } from "react";

type WorkflowItem = {
  id: string | number;
  name: string;
  status?: string;
  updatedAt?: string;
};

export default function AIWorkflowDashboard() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/workflow");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data) ? data : data.items ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load workflow");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>AI Workflow</h2>
      {error && <p style={{ color: "crimson", marginTop: 8 }}>{error}</p>}
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {items.length === 0 ? (
          <p style={{ opacity: 0.75 }}>No workflow items yet.</p>
        ) : (
          items.map((w) => (
            <div key={w.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 600 }}>{w.name}</div>
              <div style={{ opacity: 0.7, fontSize: 13 }}>
                {w.status ?? "—"} {w.updatedAt ? `• ${w.updatedAt}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
