import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, CheckCircle2,
  Mail, MessageCircle, Package, Plus, RefreshCw, Scale, Users, XCircle,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type Quote = {
  id: string; fromAddress: string; toAddress: string;
  weight: number; price: number; clientName?: string | null;
  accepted: boolean; expiresAt?: string | null; createdAt: string;
};

type Collection = {
  id: string; clientName?: string | null; clientPhone?: string | null;
  status: string; pickupAddress?: string | null; createdAt: string;
};

type Thread = {
  id: string; phone?: string | null; name?: string | null;
  lastMessage?: string | null; unreadCount?: number; lastMessageAt?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function unwrapList<T>(r: unknown): T[] {
  const d = (r as { data?: unknown } | null)?.data ?? r;
  if (Array.isArray(d)) return d as T[];
  const inner = (d as { data?: unknown } | null)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

function relTime(ts?: string | null): string {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isExpired(ts?: string | null) { return ts ? new Date(ts) < new Date() : false; }

function QuickAction({ icon: Icon, label, desc, to, color, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; desc: string; to?: string; color: string; onClick?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button onClick={onClick ?? (() => to && navigate(to))}
      className={`group flex flex-col items-start gap-3 rounded-[24px] border p-5 text-left transition-all hover:scale-[1.02] ${color}`}>
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
        <Icon className="h-5 w-5 text-white/80" />
      </div>
      <div>
        <div className="text-sm font-black text-white">{label}</div>
        <div className="text-[11px] text-white/45 mt-0.5">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-white/30 self-end group-hover:text-white/60 transition" />
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CustomerServiceHub() {
  const navigate = useNavigate();

  const [quotes,      setQuotes]      = useState<Quote[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [threads,     setThreads]     = useState<Thread[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [qRes, cRes, tRes] = await Promise.allSettled([
        api.get("/quotes"),
        api.get("/collections"),
        api.get("/whatsapp/threads"),
      ]);
      if (qRes.status === "fulfilled") setQuotes(unwrapList<Quote>(qRes.value).slice(0, 8));
      if (cRes.status === "fulfilled") setCollections(unwrapList<Collection>(cRes.value));
      if (tRes.status === "fulfilled") setThreads(unwrapList<Thread>(tRes.value).slice(0, 5));
      setLastRefresh(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Stats
  const today       = new Date(); today.setHours(0,0,0,0);
  const todayQuotes = quotes.filter(q => new Date(q.createdAt) >= today).length;
  const pendingQ    = quotes.filter(q => !q.accepted && !isExpired(q.expiresAt)).length;
  const acceptedQ   = quotes.filter(q => q.accepted).length;
  const expiredQ    = quotes.filter(q => isExpired(q.expiresAt) && !q.accepted).length;
  const pendingCols = collections.filter(c => c.status === "PENDING").length;
  const unreadMsgs  = threads.reduce((s, t) => s + (t.unreadCount ?? 0), 0);

  const quoteAcceptRate = quotes.length > 0
    ? Math.round((acceptedQ / quotes.length) * 100) : 0;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1300px] space-y-6">

        {/* Header */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <Users className="h-3.5 w-3.5 text-sky-400" />
                Customer Service
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Client Hub</h1>
              <p className="mt-1 text-sm text-white/50">Quotes · Collections · WhatsApp · Client directory</p>
            </div>
            <button onClick={() => void load()} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <QuickAction icon={Plus}           label="New Quote"       desc="Calculate & send pricing"    to="/quotes"       color="border-violet-500/25 bg-violet-500/8 hover:bg-violet-500/14" />
          <QuickAction icon={Package}        label="New Collection"  desc="Book a pickup request"       to="/collections"  color="border-amber-500/25 bg-amber-500/8 hover:bg-amber-500/14" />
          <QuickAction icon={MessageCircle}  label="WhatsApp"        desc="Client messaging hub"        to="/whatsapp"     color="border-green-500/25 bg-green-500/8 hover:bg-green-500/14" />
          <QuickAction icon={Mail}           label="Email Hub"       desc="Inbound email triage"        to="/email"        color="border-blue-500/25 bg-blue-500/8 hover:bg-blue-500/14" />
          <QuickAction icon={Users}          label="Clients"         desc="View client directory"       to="/clients"      color="border-sky-500/25 bg-sky-500/8 hover:bg-sky-500/14" />
        </div>

        {/* KPI strip */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: "Quotes Today",      value: todayQuotes,     icon: Scale,         color: "border-violet-500/20 text-violet-300"  },
            { label: "Pending Quotes",    value: pendingQ,        icon: Scale,         color: "border-violet-500/20 text-violet-300"  },
            { label: "Accepted",          value: acceptedQ,       icon: CheckCircle2,  color: "border-emerald-500/20 text-emerald-300" },
            { label: "Expired",           value: expiredQ,        icon: XCircle,       color: "border-rose-500/20 text-rose-300"      },
            { label: "Pending Pickups",   value: pendingCols,     icon: Package,       color: "border-amber-500/20 text-amber-300"    },
            { label: "Unread Messages",   value: unreadMsgs,      icon: MessageCircle, color: "border-green-500/20 text-green-300"    },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-[22px] border p-4 ${color.split(" ")[0]}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</span>
                <Icon className={`h-4 w-4 ${color.split(" ")[1]} opacity-60`} />
              </div>
              <div className={`text-2xl font-black ${color.split(" ")[1]}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* 2-col: quotes + comms */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Quote pipeline */}
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
                  <Scale className="h-4 w-4 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Quote Pipeline</h3>
                  <p className="text-[11px] text-white/40">{quoteAcceptRate}% acceptance rate · {quotes.length} total</p>
                </div>
              </div>
              <button onClick={() => navigate("/quotes")}
                className="flex items-center gap-1.5 text-xs font-bold text-violet-300 hover:text-violet-200 transition">
                All Quotes <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Rate bar */}
            <div className="mb-4">
              <div className="flex justify-between text-[10px] text-white/35 mb-1.5">
                <span>Acceptance rate</span>
                <span className="font-black text-white">{quoteAcceptRate}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/8 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${quoteAcceptRate > 60 ? "bg-emerald-400" : quoteAcceptRate > 30 ? "bg-amber-400" : "bg-rose-400"}`}
                  style={{ width: `${quoteAcceptRate}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              {quotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-white/10 text-center">
                  <Scale className="h-7 w-7 text-white/10 mb-2" />
                  <p className="text-sm text-white/25">No quotes yet</p>
                  <button onClick={() => navigate("/quotes")}
                    className="mt-2 text-xs text-violet-300 hover:underline">Create first quote</button>
                </div>
              ) : (
                quotes.slice(0, 5).map(q => (
                  <div key={q.id} onClick={() => navigate("/quotes")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => navigate("/quotes"))(); } }} role="button" tabIndex={0}
                    className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/25 px-4 py-3 cursor-pointer hover:border-white/15 hover:bg-white/5 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${q.accepted ? "bg-emerald-400" : isExpired(q.expiresAt) ? "bg-rose-400" : "bg-amber-400"}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {q.clientName || `${q.fromAddress} → ${q.toAddress}`.substring(0, 35)}
                        </div>
                        <div className="text-[10px] text-white/35">{q.weight}kg · {relTime(q.createdAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-black text-white">R{q.price.toLocaleString()}</span>
                      <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${
                        q.accepted ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" :
                        isExpired(q.expiresAt) ? "border-rose-400/25 bg-rose-500/10 text-rose-300" :
                        "border-amber-400/25 bg-amber-500/10 text-amber-300"
                      }`}>
                        {q.accepted ? "Accepted" : isExpired(q.expiresAt) ? "Expired" : "Pending"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* WhatsApp threads + collections */}
          <div className="space-y-4">

            {/* WhatsApp feed */}
            <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-green-500/15 ring-1 ring-green-500/20">
                    <MessageCircle className="h-4 w-4 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">WhatsApp</h3>
                    <p className="text-[11px] text-white/40">
                      {unreadMsgs > 0 ? `${unreadMsgs} unread` : "All caught up"}
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate("/whatsapp")}
                  className="flex items-center gap-1.5 text-xs font-bold text-green-300 hover:text-green-200 transition">
                  Open Hub <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {threads.length === 0 ? (
                  <div className="text-center py-4 text-white/20 text-xs">No conversations yet</div>
                ) : (
                  threads.map(t => (
                    <div key={t.id} onClick={() => navigate("/whatsapp")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => navigate("/whatsapp"))(); } }} role="button" tabIndex={0}
                      className="flex items-center gap-3 rounded-2xl border border-white/6 bg-black/25 px-4 py-3 cursor-pointer hover:border-green-500/20 hover:bg-green-500/4 transition">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-green-500/20 text-sm font-black text-green-300 flex-shrink-0">
                        {(t.name || t.phone || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{t.name || t.phone}</div>
                        <div className="text-[10px] text-white/35 truncate">{t.lastMessage || "—"}</div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {(t.unreadCount ?? 0) > 0 && (
                          <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-black text-white mb-1">
                            {t.unreadCount}
                          </div>
                        )}
                        <div className="text-[10px] text-white/25">{relTime(t.lastMessageAt)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pending collections */}
            <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/20">
                    <Package className="h-4 w-4 text-amber-400" />
                  </div>
                  <h3 className="text-sm font-black text-white">Pending Pickups</h3>
                </div>
                <button onClick={() => navigate("/collections")}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition">
                  View All <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {collections.filter(c => c.status === "PENDING").slice(0, 4).map(c => (
                  <div key={c.id} onClick={() => navigate("/collections")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => navigate("/collections"))(); } }} role="button" tabIndex={0}
                    className="flex items-center justify-between rounded-2xl border border-amber-500/15 bg-black/25 px-4 py-3 cursor-pointer hover:border-amber-500/30 hover:bg-amber-500/5 transition">
                    <div>
                      <div className="text-sm font-bold text-white">{c.clientName || "Unknown Client"}</div>
                      <div className="text-[10px] text-white/35 truncate max-w-[200px]">{c.pickupAddress || "—"}</div>
                    </div>
                    <div className="text-[10px] text-amber-300/60">{relTime(c.createdAt)}</div>
                  </div>
                ))}
                {collections.filter(c => c.status === "PENDING").length === 0 && (
                  <div className="text-center py-4 text-white/20 text-xs">No pending pickups</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
