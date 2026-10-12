import { TrainTrack, TriangleAlert } from "lucide-react";
import type { TrainBoardResponse } from "../../api/driverPortalApi";

/**
 * DriverTrainBoard — the TRAIN driver's duty board: consist (train manifests)
 * and track conditions (possession windows). Read-only awareness; the signed
 * documents live in the Rail Ops Console.
 */
export default function DriverTrainBoard({ board }: { board: TrainBoardResponse }) {
  return (
    <div data-testid="driver-train-board" className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrainTrack className="h-5 w-5 text-rose-300" />
          <h3 className="text-sm font-black text-white">Consist — train manifests</h3>
        </div>
        {board.manifests.length === 0 ? (
          <div className="py-3 text-sm text-white/40">No manifests on the board. Check with control before sign-on.</div>
        ) : (
          <div className="space-y-2">
            {board.manifests.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white">
                    {m.manifestNumber}{m.revision > 1 ? ` · rev ${m.revision}` : ""}
                  </div>
                  <div className="text-xs text-white/50">{m.route || m.corridor || "Route TBC"} · {m.wagons} wagon{m.wagons === 1 ? "" : "s"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white/80">{m.status}</div>
                  <div className="text-[11px] text-white/40">
                    {m.plannedDeparture ? `dep ${new Date(m.plannedDeparture).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : "dep TBC"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-amber-300" />
          <h3 className="text-sm font-black text-white">Track — possession windows (next 24h)</h3>
        </div>
        {board.possessions.length === 0 ? (
          <div className="py-3 text-sm text-white/40">No possessions on your corridors in the next 24 hours.</div>
        ) : (
          <div className="space-y-2">
            {board.possessions.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/10 bg-amber-500/[0.04] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white">{p.title}</div>
                  <div className="text-xs text-white/50">{p.location ?? p.corridorCode} · {p.kind}</div>
                </div>
                <div className="text-right text-xs text-white/70">
                  <div>{new Date(p.startsAt).toLocaleString("en-ZA", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="text-white/40">→ {new Date(p.endsAt).toLocaleString("en-ZA", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
