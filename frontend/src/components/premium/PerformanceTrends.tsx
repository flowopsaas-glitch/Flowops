import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, TrendingUp, TrendingDown, Minus, Loader2, BarChart2 } from "lucide-react";
import { api } from "../../api/client";

type TrendPoint = { date: string; created: number; delivered: number; exceptions: number; revenue: number };
type Trends = {
  days: number;
  series: TrendPoint[];
  totals: { created: number; delivered: number; exceptions: number; revenue: number };
  momentum: { created: number | null; delivered: number | null; revenue: number | null };
  note: string;
};

const RANGES = [7, 30, 90] as const;

function unwrap(res: any) {
  return res && typeof res === "object" && "data" in res ? res.data : res;
}

function fmtMoney(currency: string, n: number) {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 0, notation: n >= 100000 ? "compact" : "standard" }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function Momentum({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-black text-white/35"><Minus size={11} /> —</span>;
  }
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black ${up ? "text-emerald-300" : "text-rose-300"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(delta).toFixed(1)}%
    </span>
  );
}

/**
 * Performance Trends — the time-series view the point-in-time KPI cards can't
 * show. Daily shipment volume (created vs delivered) and invoiced revenue over
 * a selectable window, with half-vs-half momentum. Pure read of /dashboard/trends.
 */
export function PerformanceTrends({ currency }: { currency: string }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<any, any>(`/dashboard/trends?days=${days}`)
      .then((res) => { if (alive) setData(unwrap(res) as Trends); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  const hasActivity = useMemo(
    () => !!data && (data.totals.created > 0 || data.totals.delivered > 0 || data.totals.revenue > 0),
    [data],
  );

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 fx-glass fx-reveal">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-sky-400" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">Performance Trends</h2>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${days === r ? "bg-sky-500/20 text-sky-200" : "text-white/40 hover:text-white/70"}`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center h-[280px]"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
      ) : !hasActivity ? (
        <div className="flex flex-col items-center justify-center gap-2 h-[280px] text-center">
          <BarChart2 className="h-10 w-10 text-white/15" />
          <p className="text-sm font-bold text-white/40">No activity in this window yet</p>
          <p className="text-xs text-white/25">As waybills move and invoices are raised, your {days}-day trend builds here.</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Summary label="Created" value={String(data!.totals.created)} momentum={data!.momentum.created} tone="text-white" />
            <Summary label="Delivered" value={String(data!.totals.delivered)} momentum={data!.momentum.delivered} tone="text-emerald-300" />
            <Summary label="Exceptions" value={String(data!.totals.exceptions)} tone={data!.totals.exceptions ? "text-rose-300" : "text-white/70"} />
            <Summary label="Revenue invoiced" value={fmtMoney(currency, data!.totals.revenue)} momentum={data!.momentum.revenue} tone="text-sky-300" />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Volume */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Shipment volume</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data!.series} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: "#0b1530", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(l) => fmtDay(String(l))}
                  />
                  <Area type="monotone" dataKey="created" name="Created" stroke="#38bdf8" strokeWidth={2} fill="url(#gCreated)" />
                  <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#34d399" strokeWidth={2} fill="url(#gDelivered)" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 text-[10px] text-white/45">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Created</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Delivered</span>
              </div>
            </div>

            {/* Revenue */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Invoiced revenue</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data!.series} margin={{ top: 4, right: 6, left: -6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} width={48}
                    tickFormatter={(v) => fmtMoney(currency, Number(v))} />
                  <Tooltip
                    contentStyle={{ background: "#0b1530", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(l) => fmtDay(String(l))}
                    formatter={(v: any) => [fmtMoney(currency, Number(v)), "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#a78bfa" strokeWidth={2} fill="url(#gRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="mt-3 text-[10px] leading-snug text-white/30">{data!.note}</p>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, momentum, tone }: { label: string; value: string; momentum?: number | null; tone: string }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-black/20 p-3.5">
      <div className="flex items-center justify-between">
        <div className={`text-xl font-black tracking-tight ${tone}`}>{value}</div>
        {momentum !== undefined && <Momentum delta={momentum} />}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mt-1">{label}</div>
    </div>
  );
}
