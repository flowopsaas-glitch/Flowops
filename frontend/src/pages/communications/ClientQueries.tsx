import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScrollText,
  MessageCircleQuestion,
  Receipt,
  ClipboardCheck,
  ArrowUpRight,
  Search,
  Users,
  Mail,
  MessageCircle,
  ShieldAlert,
  Clock3,
  Sparkles,
  FileText,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import api from "../../api/client";

// ── helpers ───────────────────────────────────────────────────────────────────

function unwrapList(r: any): any[] {
  const d = r?.data ?? r;
  return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
}

function timeAgo(ts: string): string {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetricCard(props: {
  title: string;
  value: string | number;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
            {props.title}
          </div>
          <div className={`mt-3 text-3xl font-black tracking-tight text-white ${props.loading ? "animate-pulse" : ""}`}>
            {props.loading ? "—" : props.value}
          </div>
          <div className="mt-2 text-sm leading-relaxed text-white/62">{props.desc}</div>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function QueueCard(props: {
  title: string;
  desc: string;
  count: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white/80">
          {props.count}
        </div>
      </div>
      <div className="mt-4 text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/65">{props.desc}</div>
    </div>
  );
}

function ActivityRow(props: { title: string; meta: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-white">{props.title}</div>
        <div className="mt-1 text-xs text-white/50">{props.meta}</div>
      </div>
      <div className="shrink-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/78">
        {props.status}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type HubItem = {
  id: string;
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  body?: string | null;
  status?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  isRead?: boolean;
  source?: "email" | "whatsapp";
  clientName?: string | null;
  phone?: string | null;
};

export default function ClientQueries() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HubItem[]>([]);
  const [waThreads, setWaThreads] = useState<any[]>([]);
  const [aiEvents, setAiEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emailRaw, waRaw, aiRaw] = await Promise.allSettled([
        api.get("/email-hub"),
        api.get("/whatsapp/threads"),
        api.get("/ai-events"),
      ]);
      const emails: any[] = emailRaw.status === "fulfilled" ? unwrapList(emailRaw.value) : [];
      const threads: any[] = waRaw.status === "fulfilled" ? unwrapList(waRaw.value) : [];
      const events: any[] = aiRaw.status === "fulfilled" ? unwrapList(aiRaw.value) : [];

      const emailItems: HubItem[] = emails.map((e) => ({
        id: e.id,
        subject: e.subject ?? "(no subject)",
        fromEmail: e.fromEmail ?? e.from,
        fromName: e.fromName ?? e.from,
        body: e.body ?? e.preview,
        status: e.resolved ? "Resolved" : e.isRead ? "Read" : "Unread",
        createdAt: e.createdAt,
        resolvedAt: e.resolvedAt,
        isRead: e.isRead,
        source: "email",
      }));

      const waItems: HubItem[] = threads.map((t) => ({
        id: t.id,
        subject: t.lastMessage ?? "WhatsApp conversation",
        fromName: t.clientName ?? t.phone,
        phone: t.phone,
        status: t.unreadCount > 0 ? "Unread" : "Read",
        createdAt: t.lastMessageAt ?? t.createdAt,
        source: "whatsapp",
      }));

      const combined = [...emailItems, ...waItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setItems(combined);
      setWaThreads(threads);
      setAiEvents(events);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── derived stats ──────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const openCount    = items.filter((i) => i.status !== "Resolved").length;
  const unreadCount  = items.filter((i) => i.status === "Unread").length;
  const resolvedToday = items.filter(
    (i) => i.resolvedAt && new Date(i.resolvedAt) >= today
  ).length;
  const urgentAi     = aiEvents.filter((e) => e.severity === "critical" && !e.resolved).length;
  const waUnread     = waThreads.reduce((s: number, t: any) => s + (t.unreadCount ?? 0), 0);

  const queueCards = [
    {
      title: "Email queries",
      desc: "Client questions, disputes, and follow-ups arriving via the email hub.",
      count: `${items.filter((i) => i.source === "email" && i.status !== "Resolved").length} open`,
      icon: Search,
    },
    {
      title: "WhatsApp threads",
      desc: "Client conversations via WhatsApp click-to-chat, pending replies.",
      count: `${waUnread} unread`,
      icon: MessageCircleQuestion,
    },
    {
      title: "AI exception flags",
      desc: "Critical AI events flagged for ops — SLA risks, route deviations, payment alerts.",
      count: `${urgentAi} critical`,
      icon: Receipt,
    },
    {
      title: "Resolved today",
      desc: "Issues closed by ops, finance, or support teams today.",
      count: `${resolvedToday} closed`,
      icon: ClipboardCheck,
    },
  ];

  const recentItems = items.slice(0, 6);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(86,124,255,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(64,196,255,0.10),transparent_22%),linear-gradient(180deg,#07111f_0%,#0b1530_52%,#0e1b3f_100%)] px-4 py-5 sm:px-6 xl:px-8 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1400px] space-y-6">

        {/* Header */}
        <section className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <ScrollText className="h-4 w-4" />
                Client Support &amp; Query Flow
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Client Queries Command Center
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
                Unified queue for tenant client delivery queries, POD disputes, invoice questions,
                ETA follow-ups, and support issues from WhatsApp, email hub, and AI exception events.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/30">
                {loading ? "Loading…" : `Updated ${timeAgo(lastRefresh.toISOString())}`}
              </span>
              <button
                onClick={() => void load()}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Source summary strip */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Inbox sources</div>
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white">
                <MessageCircle className="h-4 w-4 text-white/70" /> WhatsApp
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Mail className="h-4 w-4 text-white/70" /> Email Hub
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Users className="h-4 w-4 text-white/70" /> AI Exceptions
              </div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">SLA focus</div>
              <div className="mt-3 text-2xl font-black text-white">2h</div>
              <div className="mt-2 text-sm text-white/65">Target first-response window for active client issues.</div>
            </div>
            <div className="rounded-[22px] border border-sky-300/20 bg-sky-300/10 p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-100/85">
                <Sparkles className="h-4 w-4" /> AI assist
              </div>
              <div className="mt-3 text-sm font-semibold text-white">
                Categorize, route, and escalate client cases using AI event monitoring.
              </div>
            </div>
          </div>
        </section>

        {/* KPI strip */}
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="Active queue"   value={openCount}    desc="Items currently open across email and WhatsApp."    icon={ScrollText}  loading={loading} />
          <MetricCard title="Unread"         value={unreadCount}  desc="Messages not yet read or acknowledged by the team."  icon={ShieldAlert} loading={loading} />
          <MetricCard title="AI critical"    value={urgentAi}     desc="Critical AI exceptions needing immediate review."    icon={Clock3}      loading={loading} />
          <MetricCard title="Resolved today" value={resolvedToday} desc="Client issues closed by ops, finance, or support."  icon={FileText}    loading={loading} />
        </section>

        {/* Queue breakdown */}
        <section className="grid gap-4 xl:grid-cols-4">
          {queueCards.map((item) => (
            <QueueCard key={item.title} title={item.title} desc={item.desc} count={item.count} icon={item.icon} />
          ))}
        </section>

        {/* Activity feed + quick links */}
        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.30)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <div className="text-sm font-bold text-white">Recent queue activity</div>
                <div className="mt-1 text-sm text-white/58">
                  Live activity from email hub and WhatsApp conversations.
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white/72">
                {items.length} total
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />
                ))
              ) : recentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-white/10 text-center">
                  <Mail className="h-8 w-8 text-white/10 mb-3" />
                  <p className="text-sm text-white/25">No client communications yet</p>
                  <p className="text-[11px] text-white/15 mt-1">
                    Messages from Email Hub and WhatsApp will appear here
                  </p>
                </div>
              ) : (
                recentItems.map((item) => (
                  <ActivityRow
                    key={item.id}
                    title={item.subject ?? item.fromName ?? "Query"}
                    meta={`${item.source === "email" ? "Email" : "WhatsApp"} · ${item.fromName ?? item.fromEmail ?? item.phone ?? "Client"} · ${timeAgo(item.createdAt)}`}
                    status={item.status ?? "Open"}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.30)] backdrop-blur-xl">
            <div className="text-sm font-bold text-white">Go to source</div>
            <div className="mt-1 text-sm text-white/58">Navigate to each communications channel.</div>
            <div className="mt-5 space-y-3">
              {[
                { label: "Email Hub",         desc: "Manage all inbound emails",        path: "/email",           icon: Mail },
                { label: "WhatsApp Hub",      desc: "Client WhatsApp conversations",    path: "/whatsapp",        icon: MessageCircle },
                { label: "AI Control Tower",  desc: "Critical exceptions & AI events",  path: "/ai-control-tower", icon: ShieldAlert },
                { label: "High Risk Queue",   desc: "Flagged delivery risks",           path: "/high-risk-queue", icon: ArrowUpRight },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78 hover:bg-white/8 hover:border-white/20 hover:text-white transition"
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0 text-white/45" />
                    <div className="text-left">
                      <div className="font-bold text-white text-xs">{item.label}</div>
                      <div className="text-[10px] text-white/40">{item.desc}</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
