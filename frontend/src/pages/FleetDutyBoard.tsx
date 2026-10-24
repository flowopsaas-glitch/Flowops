import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2, Phone, RefreshCw, ShieldAlert, Truck, XOctagon } from "lucide-react";
import { api } from "../api/client";
import { TiltCard } from "../components/premium/TiltCard";

/**
 * Fleet Duty Board — the dispatcher's control-room wall.
 *
 * Who is on duty, in which craft, on which vehicle, for how long (fatigue at
 * 8h warn / 10h critical), and what they are carrying — open runs in hand vs
 * landed today. The one override is FORCE END for a stuck duty (phone died
 * mid-shift): attributed, audited, evented.
 */

type RosterRow = {
  driverId: string;
  driverName: string;
  phone: string | null;
  state: "ON_DUTY" | "OFF_DUTY";
  mode: string | null;
  craft: string;
  vehicleReg: string | null;
  dutyId: string | null;
  startedAt: string | null;
  hoursOnDuty: number;
  fatigue: "OK" | "WARN" | "CRITICAL";
  openLoads: number;
  deliveredToday: number;
};

type Summary = {
  drivers: number;
  onDuty: number;
  offDuty: number;
  byMode: Record<string, number>;
  fatigueWarn: number;
  fatigueCritical: number;
  openLoads: number;
  deliveredToday: number;
};

const craftChip: Record<string, string> = {
  BICYCLE: "bg-lime-400/15 text-lime-200",
  BAKKIE: "bg-sky-400/15 text-sky-200",
  TRUCK: "bg-amber-400/15 text-amber-200",
  LINEHAUL: "bg-violet-400/15 text-violet-200",
  TRAIN: "bg-cyan-400/15 text-cyan-200",
};

const fatiguePill: Record<string, string> = {
  OK: "bg-emerald-400/15 text-emerald-200",
  WARN: "bg-amber-400/15 text-amber-200",
  CRITICAL: "bg-rose-400/20 text-rose-200",
};

export default function FleetDutyBoard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => (async () => {
    const board = (await api.get("/dispatch/fleet-duty")) as unknown as { summary: Summary | null; roster: RosterRow[] };
    setSummary(board?.summary ?? null);
    setRoster(board?.roster ?? []);
    setError(null);

  })().catch((e: unknown) => {
    setError(errorMessageOf(e) || "Failed to load the board");

  }).finally(() => {
    setLoading(false);

  }), []);

  useEffect(() => {
    void load();
  }, [load]);

  // Inline two-step confirm (no modal — keyboard-native, Escape just clears it).
  useEffect(() => {
    if (!confirmId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmId(null);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => setConfirmId(null), 4000);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [confirmId]);

  const forceEnd = async (dutyId: string) => {
    setBusyId(dutyId);
    try {
      await api.post(`/dispatch/fleet-duty/${dutyId}/force-end`, { note: "force-ended from the duty board" });
      setConfirmId(null);
      await load();
    } catch (e) {
      setError(errorMessageOf(e) || "Force-end failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" data-testid="fleet-duty-board">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Truck className="h-6 w-6 text-amber-300" /> Fleet Duty Board
          </h1>
          <p className="mt-1 text-sm text-white/60">
            The fleet at a glance — craft, vehicle, shift clock, load — and the override for stuck duties.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:border-white/25"
          data-testid="refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" data-testid="error">
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <TiltCard className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-wide text-white/40">On duty</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-300" data-testid="on-duty">{summary?.onDuty ?? "—"}</div>
        </TiltCard>
        <TiltCard className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-wide text-white/40">Off duty</div>
          <div className="mt-1 text-2xl font-semibold text-white/70">{summary?.offDuty ?? "—"}</div>
        </TiltCard>
        <TiltCard className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-wide text-white/40">Open runs</div>
          <div className="mt-1 text-2xl font-semibold text-sky-300">{summary?.openLoads ?? "—"}</div>
        </TiltCard>
        <TiltCard className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-wide text-white/40">Landed today</div>
          <div className="mt-1 text-2xl font-semibold text-white/70">{summary?.deliveredToday ?? "—"}</div>
        </TiltCard>
        <TiltCard className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-amber-200/70"><AlertTriangle className="h-3.5 w-3.5" /> Fatigue warn</div>
          <div className="mt-1 text-2xl font-semibold text-amber-300" data-testid="fatigue-warn">{summary?.fatigueWarn ?? "—"}</div>
        </TiltCard>
        <TiltCard className="rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-4">
          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-rose-200/70"><ShieldAlert className="h-3.5 w-3.5" /> Fatigue critical</div>
          <div className="mt-1 text-2xl font-semibold text-rose-300" data-testid="fatigue-critical">{summary?.fatigueCritical ?? "—"}</div>
        </TiltCard>
      </div>

      {/* Roster */}
      <TiltCard className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-white/60" />
          <h2 className="text-lg font-semibold text-white">Roster</h2>
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">{roster.length}</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : roster.length === 0 ? (
          <div className="text-sm text-white/60">No active drivers in this fleet yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-4">Driver</th>
                  <th className="py-2 pr-4">Craft</th>
                  <th className="py-2 pr-4">Vehicle</th>
                  <th className="py-2 pr-4">Shift</th>
                  <th className="py-2 pr-4">Load</th>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2">Override</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.driverId} className="border-t border-white/5" data-testid="roster-row">
                    <td className="py-3 pr-4">
                      <div className="text-white/90">{r.driverName}</div>
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70">
                          <Phone className="h-3 w-3" /> {r.phone}
                        </a>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs ${craftChip[r.mode ?? ""] ?? "bg-white/10 text-white/60"}`}>{r.craft}</span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-white/70">{r.vehicleReg ?? "—"}</td>
                    <td className="py-3 pr-4">
                      {r.state === "ON_DUTY" ? (
                        <div className="min-w-[120px]">
                          <div className="flex items-center justify-between text-xs text-white/60">
                            <span>{r.hoursOnDuty}h</span>
                            <span className={`rounded px-1.5 py-0.5 ${fatiguePill[r.fatigue]}`}>{r.fatigue}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-white/10">
                            <div
                              className={`h-1.5 rounded-full ${r.fatigue === "CRITICAL" ? "bg-rose-400" : r.fatigue === "WARN" ? "bg-amber-400" : "bg-emerald-400"}`}
                              style={{ width: `${Math.min(100, (r.hoursOnDuty / 10) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <span className="text-sky-300">{r.openLoads} open</span>
                      <span className="text-white/40"> · {r.deliveredToday} landed</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs ${r.state === "ON_DUTY" ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>
                        {r.state === "ON_DUTY" ? "ON DUTY" : "OFF"}
                      </span>
                    </td>
                    <td className="py-3">
                      {r.state === "ON_DUTY" && r.dutyId && (
                        confirmId === r.dutyId ? (
                          <button
                            onClick={() => void forceEnd(r.dutyId!)}
                            disabled={busyId === r.dutyId}
                            className="flex items-center gap-1 rounded-lg bg-rose-400/25 px-2.5 py-1 text-xs text-rose-100 hover:bg-rose-400/35 disabled:opacity-50"
                            data-testid={`confirm-end-${r.driverId}`}
                          >
                            <XOctagon className="h-3.5 w-3.5" /> Confirm force-end
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmId(r.dutyId)}
                            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:border-rose-400/40 hover:text-rose-200"
                            data-testid={`force-end-${r.driverId}`}
                          >
                            Force end
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TiltCard>
    </div>
  );
}
