import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from '../../api/client';
import { Bell, ChevronRight, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

type NotificationItem = {
  id: string | number;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  readAt?: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  total: number;
  unreadCount: number;
  take: number;
  skip: number;
  items: NotificationItem[];
};

const ENDPOINTS = {
  list: "/notifications",
};

function fmtShort(value: string) {
  try {
    const d = new Date(value);
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

function typeBadge(type?: string | null) {
  const t = (type || "INFO").toUpperCase();
  if (t.includes("ERR")) return "border-rose-500/25 bg-rose-500/10 text-rose-100";
  if (t.includes("WARN")) return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  if (t.includes("SUCCESS")) return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  return "border-blue-500/25 bg-blue-500/10 text-blue-100";
}

export default function NotificationsBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NotificationsResponse>({
    total: 0,
    unreadCount: 0,
    take: 50,
    skip: 0,
    items: [],
  });

  const boxRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      // Pull 50 from backend, we’ll show top 10 in dropdown
      const res = await api.get<NotificationsResponse>(ENDPOINTS.list, { params: { take: 50, skip: 0 } });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  // Initial + polling (keeps badge fresh)
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // 15s
    return () => clearInterval(t);

  }, []);

  // click outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      const el = boxRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const preview = useMemo(() => {
    const items = [...(data.items || [])];
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items.slice(0, 10);
  }, [data.items]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {(data.unreadCount ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full border border-blue-500/25 bg-blue-500/20 px-1 text-[11px] font-extrabold text-blue-100">
            {data.unreadCount > 99 ? "99+" : data.unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[420px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-black/80 shadow-[0_18px_70px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-extrabold text-slate-100">Notifications</div>
              <div className="text-xs font-bold text-slate-400">
                Unread <b className="text-slate-200">{data.unreadCount ?? 0}</b> • Showing latest 10
              </div>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-slate-100 hover:bg-white/10 disabled:opacity-60"
              title="Refresh"
            >
              <RefreshCcw className="h-4 w-4" />
              {loading ? "..." : "Refresh"}
            </button>
          </div>

          <div className="max-h-[380px] overflow-auto p-2">
            {preview.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-extrabold text-slate-300">
                No notifications yet.
              </div>
            ) : (
              <div className="space-y-2">
                {preview.map((n) => {
                  const unread = !n.readAt;
                  return (
                    <div
                      key={`${n.id}-${n.createdAt}`}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${typeBadge(n.type)}`}>
                              {(n.type || "INFO").toUpperCase()}
                            </span>
                            {unread ? (
                              <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[11px] font-extrabold text-blue-100">
                                UNREAD
                              </span>
                            ) : null}
                            <span className="text-[11px] font-bold text-slate-500">{fmtShort(n.createdAt)}</span>
                          </div>

                          <div className="mt-1 truncate text-sm font-extrabold text-slate-100">
                            {n.title || "Untitled"}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-300">
                            {n.message || "—"}
                          </div>
                        </div>

                        <button
                          onClick={() => nav("/notifications")}
                          className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-slate-100 hover:bg-white/10"
                          title="Open inbox"
                        >
                          Open <ChevronRight className="ml-1 inline h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => nav("/notifications")}
            className="flex w-full items-center justify-between border-t border-white/10 px-4 py-3 text-sm font-extrabold text-slate-100 hover:bg-white/5"
          >
            <span>View full inbox</span>
            <ChevronRight className="h-5 w-5 text-slate-300" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
