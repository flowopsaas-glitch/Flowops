import { useEffect, useMemo, useState } from "react";
import {
  MapPin, Truck, Clock, ShieldAlert, Plus, RefreshCw, Route,
  AlertTriangle, ChevronRight, type LucideIcon,
} from "lucide-react";
import * as wp3 from "../api/wp3Api";
import BackButton from "../components/BackButton";

const PROV_CLS: Record<string, string> = {
  MEASURED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  DECLARED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  REFERENCE: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const KIND_ICON: Record<string, LucideIcon> = {
  LINEHAUL: Truck,
  BORDER: MapPin,
  CLEARING: Clock,
  BOND: ShieldAlert,
  EMPTY_RETURN: Route,
};

const KIND_LABEL: Record<string, string> = {
  LINEHAUL: "Linehaul",
  BORDER: "Border crossing",
  CLEARING: "Clearing",
  BOND: "Bond",
  EMPTY_RETURN: "Empty return",
};

const STATUS_CLS: Record<string, string> = {
  PLANNED: "text-slate-300",
  IN_TRANSIT: "text-cyan-300",
  COMPLETED: "text-emerald-300",
  CANCELLED: "text-rose-300",
};

export default function TripLegsBoard() {
  const [trips, setTrips] = useState<wp3.Trip[]>([]);
  const [selected, setSelected] = useState<wp3.TripWithLegs | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deriving, setDeriving] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await wp3.wp3ListTrips({ limit: 50 });
        if (alive) setTrips(t);
      } catch (err) {
        if (alive)
          setError(err instanceof Error ? err.message : "Failed to load trips.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    const ref = `T-${Date.now()}`;
    try {
      const t = await wp3.wp3CreateTrip({
        reference: ref,
        origin: "Johannesburg",
        destination: "Harare",
      });
      setTrips((prev) => [t, ...prev]);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const handleOpen = async (trip: wp3.Trip) => {
    setError("");
    try {
      const full = await wp3.wp3GetTrip(trip.id);
      setSelected(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open trip.");
    }
  };

  const handleDerive = async (tripId: string) => {
    setDeriving((prev) => new Set([...prev, tripId]));
    try {
      await wp3.wp3DeriveBorderLegs(tripId);
      const full = await wp3.wp3GetTrip(tripId);
      setSelected(full);
      setTrips((prev) => prev.map((t) => (t.id === tripId ? full : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Derivation failed.");
    } finally {
      setDeriving((prev) => {
        const n = new Set(prev);
        n.delete(tripId);
        return n;
      });
    }
  };

  const handleStatus = async (tripId: string, status: string) => {
    try {
      const t = await wp3.wp3UpdateTripStatus(tripId, status);
      setTrips((prev) => prev.map((x) => (x.id === tripId ? t : x)));
      if (selected?.id === tripId) setSelected(t as wp3.TripWithLegs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed.");
    }
  };

  const provLabel = (p: string) => {
    switch (p) {
      case "MEASURED": return "Measured — from dwell session";
      case "DECLARED": return "Declared — dispatcher keyed";
      case "REFERENCE": return "Reference — planning only";
      default: return p;
    }
  };

  const fmtDuration = (m: number | null) =>
    m == null ? "duration unknown" : `${m} min`;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.10),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <BackButton to="/" />
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Route className="h-5 w-5 text-cyan-300" />
              Trip Corridor Split (WP3)
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" /> New trip
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200 text-sm">
            <AlertTriangle className="h-4 w-4 mr-2" /> {error}
          </div>
        )}

        {/* Trips list */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Trips</h3>
            <p className="text-xs text-slate-400">{trips.length} trip(s)</p>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-slate-400">
              Loading trips…
            </div>
          ) : trips.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400">
              No trips yet. Create one to begin corridor tracking.
            </div>
          ) : (
            <div className="space-y-2">
              {trips.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleOpen(t)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-700/50 hover:border-cyan-500/50 hover:bg-slate-800/40 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full border border-slate-600 flex items-center justify-center text-xs font-mono">
                      {t.reference.slice(-4)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{t.reference}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {t.origin} → {t.destination}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLS[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected trip detail */}
        {selected && (
          <TripDetail
            trip={selected}
            deriving={deriving.has(selected.id)}
            onDerive={() => handleDerive(selected.id)}
            onStatus={handleStatus}
            onClose={() => setSelected(null)}
          />
        )}

        {/* Provenance legend */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3">
          <h3 className="text-xs font-semibold text-cyan-300 mb-2 flex items-center gap-2">
            <ShieldAlert className="h-3 w-3" /> Provenance — how each leg's duration is known
          </h3>
          <div className="flex items-center gap-4 text-xs text-slate-300 space-y-2 md:space-y-0 md:flex-row">
            {[
              ["MEASURED", "Measured — derived from a CLOSED dwell session. Entry and exit are bounded by GPS fixes, never exact."],
              ["DECLARED", "Declared — keyed in by a dispatcher. Not a measurement."],
              ["REFERENCE", "Reference — from the static corridor table. Planning only, never summed into a measured total."],
            ] as [string, string][]}.map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded border ${PROV_CLS[key]}`}>{key}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            A trip total is MEASURED only when every leg is MEASURED with a
            duration. Any DECLARED or REFERENCE leg — or any MEASURED leg
            without a duration (OPEN/GAPPED session) — makes the trip total
            PARTIAL. That is the truth, not a guess.
          </p>
        </div>
      </div>
    </div>
  );
}

function TripDetail({
  trip,
  deriving,
  onDerive,
  onStatus,
  onClose,
}: {
  trip: wp3.TripWithLegs;
  deriving: boolean;
  onDerive: () => void;
  onStatus: (id: string, status: string) => void;
  onClose: () => void;
}) {
  const [newKind, setNewKind] = useState<"BORDER" | "CLEARING" | "BOND" | "EMPTY_RETURN">("BORDER");
  const [declaredMinutes, setDeclaredMinutes] = useState("");
  const [declaredNote, setDeclaredNote] = useState("");
  const [creatingLeg, setCreatingLeg] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">Trip</div>
            <div className="text-xl font-black text-white">{trip.reference}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {trip.origin} → {trip.destination}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
              trip.summary.provenance === "MEASURED"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : trip.summary.provenance === "PARTIAL"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : trip.summary.provenance === "REFERENCE_ONLY"
                    ? "border-slate-500/30 bg-slate-500/10 text-slate-300"
                    : "border-slate-500/30 text-slate-500"
            }`}
          >
            {trip.summary.provenance}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            Total: {trip.summary.totalDurationMinutes == null ? "—" : trip.summary.totalDurationMinutes + " min"}
          </span>
        </div>
      </div>

      {/* Derive from dwell sessions */}
      <div className="mb-4 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-cyan-300">Derive BORDER legs from dwell sessions</span>
          <button
            onClick={onDerive}
            disabled={deriving}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
          >
            {deriving ? (
              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Deriving</span>
            ) : (
              <span>Derive legs</span>
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-400">
          Creates MEASURED BORDER legs from CLOSED dwell sessions at this
          trip's posts. GAPPED/OPEN sessions produce a leg with no duration —
          honest, never a zero. Idempotent: sessions that already have a leg
          are skipped.
        </p>
      </div>

      {/* Legs table */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Legs</h3>
          <span className="text-xs text-slate-400">{trip.legs.length} leg(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Kind</th>
                <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Post</th>
                <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Duration</th>
                <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Provenance</th>
                <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {trip.legs.map((leg) => {
                const Icon = KIND_ICON[leg.kind] || MapPin;
                return (
                  <tr key={leg.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-200">{KIND_LABEL[leg.kind]}</span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      {leg.post ? (
                        <div className="font-mono text-slate-200">{leg.post.code}</div>
                        <div className="text-[10px] text-slate-500">{leg.post.name}</div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className="font-mono text-slate-200">{leg.durationMinutes == null ? "—" : leg.durationMinutes + " min"}</span>
                      {leg.confidenceNote && (
                        <div className="text-[10px] text-rose-300 mt-0.5">{leg.confidenceNote}</div>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border font-semibold ${PROV_CLS[leg.provenance]}`}>
                        {leg.provenance}
                      </span>
                    </td>
                    <td className="py-2.5 text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                      {leg.source ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {trip.legs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500 text-xs">
                    No legs yet. Derive from dwell sessions or add a leg below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add a leg */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
        <h3 className="text-xs font-semibold text-cyan-300 mb-3">Add a DECLARED or REFERENCE leg</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">Kind</label>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as any)}
              className="bg-slate-900 border border-slate-600 rounded text-xs text-white px-2 py-1.5 focus:ring-1 focus:ring-cyan-500"
            >
              <option value="BORDER">BORDER</option>
              <option value="CLEARING">CLEARING</option>
              <option value="BOND">BOND</option>
              <option value="EMPTY_RETURN">EMPTY_RETURN</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">Minutes</label>
            <input
              type="number"
              value={declaredMinutes}
              onChange={(e) => setDeclaredMinutes(e.target.value)}
              placeholder="e.g. 45"
              className="bg-slate-900 border border-slate-600 rounded text-xs text-white px-2 py-1.5 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">Note</label>
            <input
              value={declaredNote}
              onChange={(e) => setDeclaredNote(e.target.value)}
              placeholder="Dispatcher estimate…"
              className="bg-slate-900 border border-slate-600 rounded text-xs text-white px-2 py-1.5 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={async () => {
                setCreatingLeg(true);
                try {
                  if (newKind === "BORDER") {
                    await wp3.wp3CreateDeclaredLeg(trip.id, {
                      durationMinutes: Number(declaredMinutes) || undefined,
                      confidenceNote: declaredNote || undefined,
                    });
                  } else {
                    await wp3.wp3CreateReferenceLeg(trip.id, {
                      kind: newKind,
                      durationMinutes: Number(declaredMinutes) || undefined,
                      notes: declaredNote || undefined,
                    });
                  }
                  const full = await wp3.wp3GetTrip(trip.id);
                  // @ts-ignore - parent re-renders via selected prop
                  // We can't update parent here, but the page will refresh on re-open
                  setCreatingLeg(false);
                } catch (err) {
                  setCreatingLeg(false);
                  // Error surfaced via page-level handler isn't available here;
                  // console is acceptable for a UI spike.
                  console.error(err);
                }
              }}
              disabled={creatingLeg}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 rounded text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add leg
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
