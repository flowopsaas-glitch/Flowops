import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, ListChecks, Loader2, Package, RefreshCw } from "lucide-react";
import {
  getDriverModes, getDriverWork, getTrainBoard,
  type DriverDuty, type DriveModeConfig, type DriverMode, type TrainBoardResponse, type WorkResponse,
} from "../../api/driverPortalApi";
import DriverShiftBar from "./DriverShiftBar";
import DriverTrainBoard from "./DriverTrainBoard";

/**
 * DriverDutyHome — the mode-aware driver home.
 *
 * The shift bar declares the craft; everything below obeys it: the checklist,
 * the scoped work queue (server-side scoped — the UI cannot ask for another
 * craft's work), and for TRAIN duty the consist + possession board. One portal,
 * five professions.
 */
export default function DriverDutyHome() {
  const [modes, setModes] = useState<DriveModeConfig[]>([]);
  const [duty, setDuty] = useState<DriverDuty | null>(null);
  const [vehicleReg, setVehicleReg] = useState<string | null>(null);
  const [work, setWork] = useState<WorkResponse | null>(null);
  const [board, setBoard] = useState<TrainBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, w] = await Promise.all([getDriverModes(), getDriverWork()]);
      setModes(m.modes);
      setDuty(w.duty ?? m.activeDuty);
      setVehicleReg(m.vehicleReg);
      setWork(w);
      if (w.mode === "TRAIN") {
        setBoard(await getTrainBoard());
      } else {
        setBoard(null);
      }
    } catch (e) {
      setError((e as Error)?.message ?? "Could not load your duty board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onShiftChanged = async () => {
    setLoading(true);
    await load();
  };

  if (loading) {
    return (
      <div className="driver-portal-scope flex min-h-screen items-center justify-center bg-[#07111f] text-sky-300">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const cfg = work?.config ?? null;
  const jobs = work?.jobs ?? [];

  return (
    <div className="driver-portal-scope min-h-screen bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">My duty</h1>
            <p className="text-xs text-white/50">One portal, five crafts — pick your mode and the job reshapes.</p>
          </div>
          <button onClick={() => void load()} className="rounded-xl border border-white/10 p-2 text-white/70 hover:bg-white/[0.04]" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
        )}

        <DriverShiftBar
          modes={modes}
          activeDuty={duty}
          vehicleReg={vehicleReg}
          onChanged={() => void onShiftChanged()}
          onError={(m) => setError(m)}
        />

        {cfg && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-emerald-300" />
              <h3 className="text-sm font-black text-white">{cfg.label} checklist</h3>
            </div>
            <ul className="space-y-1">
              {cfg.checklist.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-white/70">
                  <ClipboardCheck className="h-4 w-4 text-emerald-400/70" /> {item}
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-white/40">
              Proof of delivery: {[
                cfg.pod.signature && "signature",
                cfg.pod.photo && "photo",
                cfg.pod.scan && "scan",
              ].filter(Boolean).join(" + ") || "shift sign-on only"}
            </div>
          </div>
        )}

        {!duty && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-200">
            Start a shift to see today&apos;s work. Each craft shows its own queue — and only its own.
          </div>
        )}

        {duty && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-300" />
              <h3 className="text-sm font-black text-white">
                Today&apos;s work · {cfg?.label}{jobs.length ? ` (${jobs.length})` : ""}
              </h3>
            </div>
            {jobs.length === 0 ? (
              <div className="py-3 text-sm text-white/40">Nothing assigned in this mode right now. Enjoy the quiet — or switch craft.</div>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => (
                  <div key={String(j.id)} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white">{String(j.trackingNumber ?? j.id)}</div>
                      <div className="truncate text-xs text-white/50">
                        {String(j.recipientName ?? "")}{j.recipientAddress ? ` · ${String(j.recipientAddress)}` : ""}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-white/70">{String(j.status ?? "")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {duty?.mode === "TRAIN" && board && <DriverTrainBoard board={board} />}
      </div>
    </div>
  );
}
