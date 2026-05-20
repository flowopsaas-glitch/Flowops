import React from "react";
import CommandCenter from "@/components/CommandCenter";

type Props = {
  children: React.ReactNode;
  brand?: string;
};

export default function FlowOpsLayout({ children, brand = "FlowOps" }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        color: "#e5e7eb",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Ctrl+K command palette */}
      <CommandCenter />

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20 }}>{brand}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>AI Logistics Control Tower</div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.85,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
            }}
            title="Open Command Center"
          >
            Ctrl + K
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1300, margin: "0 auto", padding: 24 }}>
        {children}
      </main>
    </div>
  );
}