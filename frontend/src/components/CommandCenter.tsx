import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";

type Command = {
  key: string; // page key used by App.tsx dynamic loader
  label: string;
  keywords: string[];
  group: "Operations" | "Drivers" | "Finance" | "Sales" | "Admin" | "Tools";
  hint?: string;
};

function setPage(pageKey: string) {
  // Base44-style navigation (best case)
  try {
    base44.page = pageKey;
    return;
  } catch {}

  // Fallback: store and reload (still works if something else reads it)
  try {
    localStorage.setItem("base44.page", pageKey);
  } catch {}

  // As a last resort, try hash navigation
  try {
    window.location.hash = `#${pageKey}`;
  } catch {}
}

function scoreMatch(query: string, text: string) {
  // Simple scoring: exact contains > word contains > char sequence
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();

  if (!q) return 1;
  if (t === q) return 100;
  if (t.includes(q)) return 60;

  // loose: all words must appear
  const words = q.split(/\s+/).filter(Boolean);
  const allWords = words.every((w) => t.includes(w));
  if (allWords) return 40;

  // very loose: ordered chars appear
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 20;

  return 0;
}

export default function CommandCenter() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const commands: Command[] = useMemo(
    () => [
      // Operations
      { key: "Dashboard", label: "Dashboard", keywords: ["home", "overview", "control tower"], group: "Operations" },
      { key: "Dispatch", label: "Dispatch", keywords: ["dispatch", "jobs", "assign"], group: "Operations", hint: "Ops queue" },
      { key: "operations/Dispatch", label: "Operations â€¢ Dispatch", keywords: ["dispatch", "ops"], group: "Operations", hint: "If you use folders" },
      { key: "Collections", label: "Collections", keywords: ["collections", "orders", "jobs"], group: "Operations" },
      { key: "operations/Collections", label: "Operations â€¢ Collections", keywords: ["collections", "ops"], group: "Operations" },
      { key: "LiveTracking", label: "Live Tracking", keywords: ["tracking", "live", "map"], group: "Operations" },

      // Drivers
      { key: "DriverApp", label: "Driver App", keywords: ["driver", "mobile", "app"], group: "Drivers" },
      { key: "Drivers", label: "Drivers", keywords: ["drivers", "people"], group: "Drivers" },
      { key: "Routes", label: "Routes", keywords: ["routes", "route"], group: "Drivers" },

      // Finance
      { key: "Invoices", label: "Invoices", keywords: ["invoice", "billing", "pdf"], group: "Finance" },
      { key: "Waybills", label: "Waybills", keywords: ["waybill", "paperwork"], group: "Finance" },

      // Sales
      { key: "Quotes", label: "Quotes", keywords: ["quote", "pricing"], group: "Sales" },
      { key: "CustomerPortal", label: "Customer Portal", keywords: ["customer", "portal", "client"], group: "Sales" },
      { key: "Clients", label: "Clients", keywords: ["clients", "customers"], group: "Sales" },

      // Admin / Tools
      { key: "Settings", label: "Settings", keywords: ["settings", "config"], group: "Admin" },
      { key: "admin/AdminApprovalDashboard", label: "Admin â€¢ Approval Dashboard", keywords: ["admin", "approval"], group: "Admin" },

      // AI / Ops tooling
      { key: "WhatsAppHub", label: "WhatsApp Hub", keywords: ["whatsapp", "messages", "automation"], group: "Tools" },
      { key: "RouteOptimizer", label: "Route Optimizer", keywords: ["route", "optimizer", "ai"], group: "Tools" },
      { key: "CapacityPlanning", label: "Capacity Planning", keywords: ["capacity", "planning"], group: "Tools" },
      { key: "MRPSystem", label: "MRP System", keywords: ["mrp", "stock", "planning"], group: "Tools" },
      { key: "LocationAnalysis", label: "Location Analysis", keywords: ["location", "analysis"], group: "Tools" },
      { key: "CarrierManagement", label: "Carrier Management", keywords: ["carrier", "courier"], group: "Tools" },
      { key: "TrackShipment", label: "Track Shipment", keywords: ["track", "tracking", "public"], group: "Tools" }
    ],
    [],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return commands.map((c, idx) => ({ c, s: 1, idx }));

    const ranked = commands
      .map((c, idx) => {
        const hay = [c.label, c.key, c.group, ...(c.keywords || [])].join(" ");
        const s = scoreMatch(query, hay);
        return { c, s, idx };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.idx - b.idx);

    return ranked;
  }, [q, commands]);

  const list = filtered.map((x) => x.c);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Open: Ctrl+K / Cmd+K
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setQ("");
        setActive(0);
        return;
      }

      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, Math.max(0, list.length - 1)));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const picked = list[active];
        if (picked) {
          setPage(picked.key);
          setOpen(false);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, active, list]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
  }, [q, open]);

  if (!open) return null;

  return (
    <div
      onMouseDown={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "start center",
        paddingTop: 90,
        zIndex: 9999
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(820px, 94vw)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(13,18,32,0.95)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          overflow: "hidden"
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type: dispatch â€¢ driver â€¢ invoice â€¢ tracking"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "#e5e7eb",
              outline: "none",
              fontSize: 14
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Enter = open â€¢ â†‘/â†“ = navigate â€¢ Esc = close
          </div>
        </div>

        <div style={{ maxHeight: 420, overflow: "auto" }}>
          {list.length === 0 ? (
            <div style={{ padding: 16, opacity: 0.8 }}>No matches.</div>
          ) : (
            list.map((c, i) => {
              const isActive = i === active;
              return (
                <div
                  key={`${c.key}-${i}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    setPage(c.key);
                    setOpen(false);
                  }}
                  style={{
                    padding: "12px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isActive ? "rgba(37,99,235,0.20)" : "transparent",
                    borderTop: "1px solid rgba(255,255,255,0.06)"
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800 }}>{c.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{c.group}</div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {c.hint ? <div style={{ fontSize: 12, opacity: 0.7 }}>{c.hint}</div> : null}
                    <code
                      style={{
                        fontSize: 12,
                        opacity: 0.7,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)"
                      }}
                    >
                      {c.key}
                    </code>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
