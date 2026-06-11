import React, { useEffect, useMemo, useState } from "react";
import {
  Brain,
  RefreshCw,
  Search,
  ShieldAlert,
  Crown,
  Mail,
  CheckCircle2,
  XCircle
} from "lucide-react";
import {
  AIEvent,
  getAIEvents,
  getAIEventStats,
  resolveAIEvent,
  dismissAIEvent,
  seedAIEventsDemo
} from "../../api/aiEventsApi";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function tone(severity: string) {
  if (severity === "CRITICAL") return "border-red-400/20 bg-red-500/10 text-red-100";
  if (severity === "HIGH") return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  if (severity === "MEDIUM") return "border-blue-400/20 bg-blue-500/10 text-blue-100";
  return "border-white/10 bg-white/10 text-white/80";
}

export default function AIEventCenter() {
  const [events, setEvents] = useState<AIEvent[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    critical: 0,
    high: 0,
    resolved: 0,
    upgradeIntent: 0,
    demoRequests: 0
  });
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");

  async function loadAll() {
    setLoading(true);
    setPageError("");

    try {
      const [rows, statsData] = await Promise.all([
        getAIEvents({ search }),
        getAIEventStats()
      ]);
      setEvents(rows);
      setStats(statsData);
    } catch (error: any) {
      setPageError(
        error?.response?.data?.message || error?.message || "Failed to load AI events."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const sorted = useMemo(() => events, [events]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-200">
                <Brain className="h-3.5 w-3.5" />
                AI event architecture
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                AI Event Center
              </h1>
              <p className="mt-2 text-sm text-white/72">
                Central intelligence stream for FlowOps. Email Hub, WhatsApp Hub, billing,
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await seedAIEventsDemo();
                  await loadAll();
                }}
                className="rounded-2xl bg-fuchsia-500/80 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-fuchsia-500"
              >
                Seed Demo Events
              </button>

              <button
                type="button"
                onClick={loadAll}
                disabled={loading}
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-white/15"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Refresh
                </span>
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4 xl:grid-cols-7">
            <MiniStat label="Total" value={String(stats.total)} />
            <MiniStat label="Open" value={String(stats.open)} />
            <MiniStat label="Critical" value={String(stats.critical)} />
            <MiniStat label="High" value={String(stats.high)} />
            <MiniStat label="Resolved" value={String(stats.resolved)} />
            <MiniStat label="Upgrade" value={String(stats.upgradeIntent)} />
            <MiniStat label="Demo" value={String(stats.demoRequests)} />
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-2xl">
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search AI events..."
              className="w-full rounded-2xl border border-white/10 bg-white/8 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/45 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={loadAll}
            className="mt-3 rounded-2xl bg-blue-500/80 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-blue-500"
          >
            Apply Search
          </button>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {pageError}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {sorted.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/6 p-10 text-center">
              <div className="text-lg font-bold text-white">No AI events yet</div>
            </div>
          ) : (
            sorted.map((event) => (
              <div key={event.id} className="rounded-[24px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", tone(event.severity))}>
                        {event.severity}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold text-white/80">
                        {event.type}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold text-white/80">
                        {event.source}
                      </span>
                    </div>

                    <div className="mt-3 text-xl font-extrabold text-white">{event.title}</div>
                    <div className="mt-2 text-sm leading-6 text-white/72">{event.summary}</div>

                    {event.explanation ? (
                      <div className="mt-3 text-sm text-white/62">{event.explanation}</div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/50">
                      {event.company ? <span>Company: {event.company.name}</span> : null}
                      {event.client ? <span>Client: {event.client.name}</span> : null}
                      {event.collection ? <span>Collection: {event.collection.name}</span> : null}
                      {event.quote ? <span>Quote: #{event.quote.id}</span> : null}
                      {event.emailHubItem ? <span>Email: {event.emailHubItem.subject}</span> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.aiSignals?.map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/75 ring-1 ring-white/10"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>

                    {event.suggestedAction ? (
                      <div className="mt-4 rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/10 p-4 text-sm text-fuchsia-100">
                        <span className="font-bold">Suggested Action:</span> {event.suggestedAction}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await resolveAIEvent(event.id, "Resolved from AI Event Center");
                        await loadAll();
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-200 ring-1 ring-white/15 transition hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Resolve
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await dismissAIEvent(event.id, "Dismissed from AI Event Center");
                        await loadAll();
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-bold text-red-200 ring-1 ring-white/15 transition hover:bg-red-500/20"
                    >
                      <XCircle className="h-4 w-4" />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/8 p-4">
      <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-black text-white">{props.value}</div>
    </div>
  );
}
