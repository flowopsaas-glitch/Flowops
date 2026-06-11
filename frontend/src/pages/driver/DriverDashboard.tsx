// src/pages/driver/DriverDashboard.tsx
import React, { useContext, useMemo } from "react";
import { NotificationContext } from "@/context/NotificationContext";

type DriverNotification = {
  id: string | number;
  message: string;
  level?: "INFO" | "WARN" | "URGENT";
  createdAt?: string;
};

type NotificationContextShape = {
  // Option A: function getter
  getVisibleNotifications?: () => DriverNotification[] | undefined | null;

  // Option B: direct array
  notifications?: DriverNotification[] | undefined | null;
};

function badgeStyle(level?: DriverNotification["level"]) {
  if (level === "URGENT")
    return { bg: "rgba(239,68,68,0.18)", bd: "rgba(239,68,68,0.35)", fg: "rgba(254,226,226,0.95)" };
  if (level === "WARN")
    return { bg: "rgba(234,179,8,0.18)", bd: "rgba(234,179,8,0.35)", fg: "rgba(254,249,195,0.95)" };
  return { bg: "rgba(59,130,246,0.18)", bd: "rgba(59,130,246,0.35)", fg: "rgba(219,234,254,0.95)" };
}

function formatTime(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export default function DriverDashboard() {
  const ctx = useContext(NotificationContext as unknown as React.Context<NotificationContextShape | null>);

  const notifications: DriverNotification[] = useMemo(() => {
    if (!ctx) return [];

    // Prefer getter if it exists
    if (typeof ctx.getVisibleNotifications === "function") {
      const list = ctx.getVisibleNotifications();
      return Array.isArray(list) ? list : [];
    }

    // Otherwise fall back to ctx.notifications
    return Array.isArray(ctx.notifications) ? ctx.notifications : [];
  }, [ctx]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))",
          color: "rgba(226,232,240,0.95)",
          padding: 18
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: -0.3 }}>Driver Dashboard</div>
            <div style={{ opacity: 0.75, fontWeight: 800, marginTop: 4 }}>
              Notifications: <b>{notifications.length}</b>
            </div>
          </div>

          <div style={{ opacity: 0.65, fontWeight: 800, fontSize: 12 }}>
            Live alerts from dispatch / ops
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {notifications.length === 0 ? (
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                padding: 14,
                fontWeight: 800,
                opacity: 0.8
              }}
            >
              No notifications right now.
            </div>
          ) : (
            notifications.map((n) => {
              const b = badgeStyle(n.level);
              return (
                <div
                  key={String(n.id)}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                    padding: 14,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.25 }}>{n.message}</div>
                    {n.createdAt ? (
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65, fontWeight: 800 }}>
                        {formatTime(n.createdAt)}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      whiteSpace: "nowrap",
                      alignSelf: "flex-start",
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: b.bg,
                      border: `1px solid ${b.bd}`,
                      color: b.fg,
                      fontWeight: 900,
                      fontSize: 12
                    }}
                    title={n.level || "INFO"}
                  >
                    {n.level || "INFO"}
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
