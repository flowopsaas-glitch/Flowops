import { useEffect, useState } from "react";
import { ArrowRightLeft, Bike, Car, ClipboardCheck, Loader2, LogOut, PlayCircle, TrainTrack, Truck, X } from "lucide-react";
import {
  endDuty, startDuty, type DriverDuty, type DriveModeConfig, type DriverMode,
} from "../../api/driverPortalApi";

/**
 * DriverShiftBar — the mode switcher and shift lifecycle.
 *
 * One tap to change craft: starting a new mode auto-ends the current duty
 * (server-side) and the whole portal reshapes. Heavy modes (truck, linehaul,
 * train) demand a vehicle registration before the shift can start — the same
 * rule the server enforces.
 */

const MODE_ICONS: Record<DriverMode, typeof Bike> = {
  BICYCLE: Bike, BAKKIE: Car, TRUCK: Truck, LINEHAUL: ArrowRightLeft, TRAIN: TrainTrack,
};

const MODE_TONE: Record<DriverMode, string> = {
  BICYCLE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  BAKKIE: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TRUCK: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LINEHAUL: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  TRAIN: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

interface Props {
  modes: DriveModeConfig[];
  activeDuty: DriverDuty | null;
  vehicleReg: string | null;
  onChanged: (result: { duty: DriverDuty | null; mode: DriverMode | null }) => void;
  onError: (message: string) => void;
}

export default function DriverShiftBar({ modes, activeDuty, vehicleReg, onChanged, onError }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<DriverMode | null>(null);
  const [reg, setReg] = useState(vehicleReg ?? "");
  const [busy, setBusy] = useState(false);

  const activeCfg = modes.find((m) => m.mode === activeDuty?.mode) ?? null;

  // Escape-to-dismiss on the mode picker (design-system rule).
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPickerOpen(false); setPendingMode(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  const chooseMode = (mode: DriverMode) => {
    const cfg = modes.find((m) => m.mode === mode);
    if (!cfg?.allowed) return;
    if (cfg.requiresVehicleReg) {
      setPendingMode(mode);           // ask for the reg first (heavy-mode rule)
      setReg(vehicleReg ?? "");
    } else {
      void fireStart(mode, undefined);
    }
  };

  const fireStart = async (mode: DriverMode, regValue?: string) => {
    setBusy(true);
    try {
      const r = await startDuty({ mode, vehicleReg: regValue?.trim() || undefined });
      setPickerOpen(false);
      setPendingMode(null);
      onChanged({ duty: r.duty, mode: r.duty.mode });
    } catch (e) {
      onError((e as Error)?.message ?? "Could not start duty");
    } finally {
      setBusy(false);
    }
  };

  const fireEnd = async () => {
    setBusy(true);
    try {
      await endDuty();
      onChanged({ duty: null, mode: null });
    } catch (e) {
      onError((e as Error)?.message ?? "Could not end duty");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="driver-shift-bar" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-3">
        {activeDuty && activeCfg ? (
          <>
            <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${MODE_TONE[activeDuty.mode]}`}>
              {(() => { const Icon = MODE_ICONS[activeDuty.mode]; return <Icon className="h-4 w-4" />; })()}
              {activeCfg.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white">
                On duty{activeDuty.vehicleReg ? ` · ${activeDuty.vehicleReg}` : ""}
              </div>
              <div className="text-xs text-white/50 truncate">
                Since {new Date(activeDuty.startedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })} · {activeCfg.description}
              </div>
            </div>
            <button
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.04]"
            >
              Switch mode
            </button>
            <button
              onClick={() => void fireEnd()}
              disabled={busy}
              data-testid="end-duty"
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} End shift
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white">You are off duty</div>
              <div className="text-xs text-white/50">Start a shift and pick your craft — the portal becomes that job.</div>
            </div>
            <button
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              data-testid="start-duty"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-400"
            >
              <PlayCircle className="h-4 w-4" /> Start shift
            </button>
          </>
        )}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPickerOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0f14] p-6"
            role="dialog"
            aria-label="Choose your drive mode"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">What are you driving?</h3>
              <button onClick={() => setPickerOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modes.map((m) => {
                const Icon = MODE_ICONS[m.mode];
                return (
                  <button
                    key={m.mode}
                    disabled={!m.allowed || busy}
                    onClick={() => chooseMode(m.mode)}
                    data-testid={`mode-${m.mode}`}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                      m.allowed ? "border-white/10 hover:bg-white/[0.04]" : "border-white/5 opacity-40"
                    } ${activeDuty?.mode === m.mode ? "ring-2 ring-sky-500/60" : ""}`}
                  >
                    <span className={`inline-flex rounded-lg border p-2 ${MODE_TONE[m.mode]}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white">{m.label}</span>
                      <span className="block text-xs text-white/50">{m.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {pendingMode && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3" data-testid="reg-prompt">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <ClipboardCheck className="h-4 w-4" />
                  {MODE_LABEL_SAFE(pendingMode)} duty needs a vehicle registration
                </div>
                <div className="flex gap-2">
                  <input
                    value={reg}
                    onChange={(e) => setReg(e.target.value)}
                    placeholder="e.g. GP 123-456"
                    aria-label="Vehicle registration"
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
                  />
                  <button
                    disabled={busy || !reg.trim()}
                    onClick={() => void fireStart(pendingMode, reg)}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go on duty"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MODE_LABEL_SAFE(mode: DriverMode): string {
  return { BICYCLE: "Bicycle", BAKKIE: "Bakkie", TRUCK: "Truck", LINEHAUL: "Linehaul", TRAIN: "Train" }[mode] ?? mode;
}
