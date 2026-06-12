import React from "react";
import { Link, useLocation } from "react-router-dom";
import { clearSession } from "../lib/session";

function active(path: string, current: string) {
  return current.startsWith(path)
    ? { background: "#0f2e6e", color: "#fff", borderColor: "#0f2e6e" }
    : { background: "#fff", color: "#111827", borderColor: "#e5e7eb" };
}

export default function TopNav() {
  const loc = useLocation();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "#ffffffcc",
        backdropFilter: "blur(6px)",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, marginRight: 8 }}>FlowOps</div>

        <Link to="/collections" style={{ ...pill(), ...active("/collections", loc.pathname) }}>
          Collections + AI
        </Link>

        <Link to="/driver" style={{ ...pill(), ...active("/driver", loc.pathname) }}>
          Driver + AI
        </Link>

        <Link to="/dispatch" style={{ ...pill(), ...active("/dispatch", loc.pathname) }}>
          Dispatch + AI
        </Link>

        <Link to="/sales" style={{ ...pill(), ...active("/sales", loc.pathname) }}>
          Sales + AI
        </Link>

        <Link to="/warehouse" style={{ ...pill(), ...active("/warehouse", loc.pathname) }}>
          Warehousing + AI
        </Link>

        <Link to="/invoices" style={{ ...pill(), ...active("/invoices", loc.pathname) }}>
          Invoices + AI
        </Link>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            style={pill()}
            onClick={() => {
              clearSession();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

function pill() {
  return {
    textDecoration: "none",
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 800,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
  } as const;
}