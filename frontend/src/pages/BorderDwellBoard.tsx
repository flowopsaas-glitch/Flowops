import { useEffect, useMemo, useState } from "react";
import {
  MapPin, Clock, BarChart, Activity, ShieldAlert, Info, RefreshCw,
  AlertTriangle, Clock as ClockIcon,
} from "lucide-react";
import * as wp3 from "../api/wp3Api";
import BackButton from "../components/BackButton";

type StateKey = "CLOSED" | "OPEN" | "GAPPED";

const STATE_LABEL: Record<StateKey, string> = {
  CLOSED: "Completed crossings",
  OPEN: "At border now (exit not observed)",
  GAPPED: "At border (sample gap — duration unknown)",
};

const STATE_CLS: Record<StateKey, string> = {
  CLOSED: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  OPEN: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  GAPPED: "text-rose-300 border-rose-500/30 bg-rose-500/10",
};

const SUPPRESSED_MSG = (n: number) =>
  `NOT ENOUGH SESSIONS (n=${n}) — fewer than 5 completed crossings. Figure suppressed.`;

/** Minutes with honest precision label. */
function fmtMinutes(ms: number | null): string {
  if (ms == null) return "—";
  const m = Math.round(ms / 1000 / 60);
  return `${m} min`;
}

export default function BorderDwellBoard() {
  const [posts, setPosts] = useState<wp3.BorderPost[]>([]);
  const [aggregates, setAggregates] = useState<Map<string, wp3.DwellAggregates>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await wp3.wp3ListBorderPosts();
        if (alive) setPosts(p);
        await loadAggregates(p.map((x) => x.id), alive);
      } catch (err) {
        if (alive)
          setError(
            err instanceof Error ? err.message : "Failed to load border posts.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadAggregates = async (postIds: string[], aliveFn: () => boolean) => {
    const next = new Map<string, wp3.DwellAggregates>();
    for (const id of postIds) {
      try {
        const a = await wp3.wp3GetDwellAggregates(id);
        if (aliveFn()) next.set(id, a);
      } catch {
        /* skip individual post failures — board stays usable */
      }
    }
    if (aliveFn()) setAggregates(next);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const p = await wp3.wp3ListBorderPosts();
      setPosts(p);
      await loadAggregates(p.map((x) => x.id), () => true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Refresh failed.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const getAggregate = (postId: string): wp3.DwellAggregates | undefined =>
    aggregates.get(postId);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.10),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <BackButton to="/" />
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-cyan-300" />
              Cross-Border Dwell Board (WP3)
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200 text-sm">
            <AlertTriangle className="h-4 w-4 mr-2" /> {error}
          </div>
        )}

        {/* What this board is */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> What this board shows
          </h2>
          <p className="text-sm text-slate-300 mt-1">
            Median, P90 and n per border post, computed from actual GPS
            crossing sessions — not reference-table guesses. Sessions with a
            sample gap over 15 minutes are marked {STATE_LABEL.GAPPED}; visits
            still at the border are {STATE_LABEL.OPEN}. Both are counted but
            excluded from headline numbers. Fewer than 5 completed crossings
            per post is shown as "not enough sessions" — never a number, never
            a "≈".
          </p>
        </div>

        {/* Posts grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => {
            const a = getAggregate(post.id);
            const suppressed = a?.suppressed ?? true;
            const n = a?.n ?? 0;
            const closed = a?.closedCount ?? 0;
            const open = a?.openCount ?? 0;
            const gapped = a?.gappedCount ?? 0;
            return (
              <article
                key={post.id}
                className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 hover:border-cyan-500/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-white">{post.name}</h3>
                    <p className="text-xs text-slate-400">{post.code}</p>
                    <p className="text-xs text-cyan-300 mt-0.5">
                      {post.countries}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {post.is24Hour && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        24 hr
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Headline — suppressed or measured */}
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                      Median dwell
                    </p>
                    {suppressed ? (
                      <div className="flex items-center gap-2">
                        <span className="text-rose-300 font-mono text-lg">
                          {SUPPRESSED_MSG(n)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-black text-cyan-300">
                          {fmtMinutes(a?.medianMs)}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span>P90 {fmtMinutes(a?.p90Ms)}</span>
                          <span>•</span>
                          <span>n={n}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Completeness split */}
                  <div className="grid grid-cols-3 gap-2">
                    {[STATE_LABEL.CLOSED, STATE_LABEL.OPEN, STATE_LABEL.GAPPED] as StateKey[]}.map(
                      (key) => {
                        const count = key === "CLOSED" ? closed : key === "OPEN" ? open : gapped;
                        return (
                          <div
                            key={key}
                            className={`rounded p-2 text-xs border ${STATE_CLS[key]}`}
                          >
                            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                              {key}
                            </div>
                            <div className="font-mono font-bold">{count}</div>
                          </div>
                        );
                      },
                    )
                  </div>

                  {/* Reference baseline (never blended with measured) */}
                  {post.referenceAvgWaitHours != null && (
                    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                        Reference baseline (static, not measured)
                      </p>
                      <div className="text-sm text-slate-300 font-mono">
                        {Math.round(post.referenceAvgWaitHours)} h typical
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Hand-compiled reference — not a FlowOps measurement.
                      </p>
                    </div>
                  )}
                </div>

                {/* Drill-in */}
                <button
                  onClick={() => {
                    // Navigation handled by parent router; here we just highlight
                  }}
                  className="mt-3 w-full text-left text-xs text-cyan-300 hover:underline flex items-center gap-1"
                >
                  <ClockIcon className="h-3 w-3" /> View sessions →
                </button>
              </article>
            );
          })}
        </div>

        {/* Provenance disclaimer */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-xs text-slate-400">
          <Info className="h-4 w-4 mr-2 inline" />
          Every figure on this board is derived from GPS crossing sessions in
          this tenant only. Border post coordinates and reference wait hours
          are hand-compiled reference data (provenance: STATIC_REFERENCE) and
          are never summed, averaged or blended with measured dwell.
        </div>
      </div>
    </div>
  );
}
