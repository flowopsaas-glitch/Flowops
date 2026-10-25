import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useEffect, useState } from "react";
import {
  Trophy, Medal, Star, Truck, Package, DollarSign, Loader2, AlertTriangle, Crown, Target, ChevronDown,
} from "lucide-react";
import { api } from "../api/client";

type DriverPerf = {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleReg: string | null;
  rank: number;
  score: number;
  deliveries: number;
  onTimePct: number;
  failedCount: number;
  customerRatingAvg: number | null;
  codCollected: number;
  collectionsCompleted: number;
  status: string;
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/20 ring-2 ring-amber-400/40"><Crown className="h-5 w-5 text-amber-400" /></div>;
  if (rank === 2) return <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-300/10 ring-2 ring-slate-300/30"><Medal className="h-5 w-5 text-slate-300" /></div>;
  if (rank === 3) return <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-700/20 ring-2 ring-amber-700/30"><Medal className="h-5 w-5 text-amber-600" /></div>;
  return <div className="grid h-10 w-10 place-items-center rounded-full bg-white/5 ring-1 ring-white/10"><span className="text-sm font-black text-white/50">#{rank}</span></div>;
}

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#34d399" : score >= 40 ? "#38bdf8" : "#f59e0b";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{score}</span>
    </div>
  );
}

function TopThree({ drivers }: { drivers: DriverPerf[] }) {
  const top = drivers.slice(0, 3);
  if (top.length === 0) return null;

  const podiumOrder = top.length >= 3 ? [top[1], top[0], top[2]] : top;
  const heights = ["h-24", "h-32", "h-20"];
  const podiumHeights = top.length >= 3 ? [heights[1], heights[0], heights[2]] : heights;

  return (
    <div className="flex items-end justify-center gap-4 py-8">
      {podiumOrder.map((d, i) => {
        const isFirst = d.rank === 1;
        return (
          <div key={d.id} className="flex flex-col items-center gap-2">
            <RankBadge rank={d.rank} />
            <div className="text-sm font-black text-white truncate max-w-[100px]">{d.name}</div>
            <div className="text-[10px] text-white/40">{d.deliveries} deliveries</div>
            <ScoreRing score={d.score} size={isFirst ? 56 : 44} />
            <div className={`w-20 rounded-t-xl ${isFirst ? "bg-amber-500/20 border-amber-400/30" : "bg-white/5 border-white/10"} border ${podiumHeights[i]} flex items-end justify-center pb-2`}>
              <span className="text-xs font-black text-white/60">#{d.rank}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DriverLeaderboard() {
  const [drivers, setDrivers] = useState<DriverPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "deliveries" | "onTimePct" | "codCollected">("score");

  useEffect(() => {
    api.get("/drivers/leaderboard")
      .then((r) => setDrivers(r?.data ?? r))
      .catch((e: unknown) => setError(errorMessageOf(e) || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...drivers].sort((a, b) => {
    if (sortBy === "score") return b.score - a.score;
    if (sortBy === "deliveries") return b.deliveries - a.deliveries;
    if (sortBy === "onTimePct") return b.onTimePct - a.onTimePct;
    return b.codCollected - a.codCollected;
  });

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-sky-400/50" />
    </div>
  );

  if (error) return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-400/60" />
        <p className="mt-3 text-sm font-bold text-white/50">{error}</p>
      </div>
    </div>
  );

  const totalDeliveries = drivers.reduce((s, d) => s + d.deliveries, 0);
  const avgOnTime = drivers.length > 0 ? Math.round(drivers.reduce((s, d) => s + d.onTimePct, 0) / drivers.length) : 0;
  const totalCod = drivers.reduce((s, d) => s + d.codCollected, 0);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/[0.08] via-orange-500/[0.04] to-transparent p-6 lg:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/5 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
              <Trophy className="h-3 w-3" /> Performance Rankings
            </div>
            <h1 className="text-3xl font-black text-white">Driver Leaderboard</h1>
            <p className="mt-1 text-sm text-white/50">
              {drivers.length} active drivers · Current month performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-white/30">Sort by:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="appearance-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 pr-8 text-xs font-bold text-white outline-none focus:border-amber-400/30"
              >
                <option value="score">Overall Score</option>
                <option value="deliveries">Deliveries</option>
                <option value="onTimePct">On-Time %</option>
                <option value="codCollected">COD Collected</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-white/40" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <Package className="mx-auto h-5 w-5 text-sky-400/60" />
          <div className="mt-2 text-2xl font-black text-white">{totalDeliveries}</div>
          <div className="text-[10px] font-bold text-white/30">Total Deliveries</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <Target className="mx-auto h-5 w-5 text-emerald-400/60" />
          <div className="mt-2 text-2xl font-black text-white">{avgOnTime}%</div>
          <div className="text-[10px] font-bold text-white/30">Avg On-Time</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <DollarSign className="mx-auto h-5 w-5 text-violet-400/60" />
          <div className="mt-2 text-2xl font-black text-white">R{totalCod.toLocaleString()}</div>
          <div className="text-[10px] font-bold text-white/30">COD Collected</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <Truck className="mx-auto h-5 w-5 text-amber-400/60" />
          <div className="mt-2 text-2xl font-black text-white">{drivers.length}</div>
          <div className="text-[10px] font-bold text-white/30">Active Drivers</div>
        </div>
      </div>

      {/* Podium */}
      {drivers.length >= 3 && <TopThree drivers={drivers} />}

      {/* Full table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-white/30">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Deliveries</th>
                <th className="px-4 py-3 text-center">On-Time</th>
                <th className="px-4 py-3 text-center">Rating</th>
                <th className="px-4 py-3 text-center">COD</th>
                <th className="px-4 py-3 text-center">Collections</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3"><RankBadge rank={d.rank} /></td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-white">{d.name}</div>
                    <div className="text-[10px] text-white/30">{d.vehicleType} · {d.vehicleReg || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-center"><ScoreRing score={d.score} size={40} /></td>
                  <td className="px-4 py-3 text-center font-black text-white">{d.deliveries}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${d.onTimePct >= 90 ? "text-emerald-400" : d.onTimePct >= 70 ? "text-sky-400" : "text-amber-400"}`}>
                      {d.onTimePct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {d.customerRatingAvg ? (
                      <span className="flex items-center justify-center gap-1 text-amber-300">
                        <Star className="h-3 w-3 fill-amber-300" />
                        <span className="font-bold">{d.customerRatingAvg}</span>
                      </span>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-400">R{d.codCollected.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center text-white/60">{d.collectionsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
