import type { ConflictScan } from "../../api/railChangeApi";
import { formatDateTime, severityLabel, summariseConflicts } from "../../lib/railChange";
import { Banner } from "./railUi";

const MAX_LISTED = 5;

/**
 * Possession-window conflicts (an IM possession that overlaps a consignment that is booked on the same corridor).
 * Detection is the SERVER's (`GET /rail/possessions/conflicts`) and is advisory: consignments with no schedule or an
 * unrecognised corridor cannot be checked, and are reported as such — never assumed clear.
 *
 *  • no `consignmentId`  → every conflict (the Rail Operations header)
 *  • with `consignmentId` → only that consignment's (its drawer)
 */
export default function PossessionConflictBanner({
  scan, consignmentId, onOpenPossessions,
}: { scan: ConflictScan | null | undefined; consignmentId?: string; onOpenPossessions?: () => void }) {
  if (!scan) return null;
  const s = summariseConflicts(scan, consignmentId);

  if (s.total === 0) {
    if (s.unchecked === 0) return null;
    return (
      <Banner tone="muted" title={consignmentId ? "Not checked against possession windows" : `${s.unchecked} active consignment${s.unchecked === 1 ? "" : "s"} could not be checked against possession windows`}>
        No usable schedule or an unrecognised corridor — set the planned departure and a catalog corridor to enable the check. It is not assumed clear.
      </Banner>
    );
  }

  const shown = scan.conflicts.filter((c) => !consignmentId || c.consignmentId === consignmentId).slice(0, MAX_LISTED);
  const title = consignmentId
    ? `Possession conflict — this consignment overlaps ${s.windows} possession window${s.windows === 1 ? "" : "s"}`
    : `Possession conflict — ${s.consignments} consignment${s.consignments === 1 ? "" : "s"} overlap${s.consignments === 1 ? "s" : ""} ${s.windows} possession window${s.windows === 1 ? "" : "s"}`;
  return (
    <div data-testid="possession-banner">
      <Banner tone={s.hard > 0 ? "danger" : "warn"} title={title}>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {shown.map((c) => (
            <li key={`${c.windowId}:${c.consignmentId}`}>
              <span className="font-mono font-semibold">{c.consignmentNumber}</span> · “{c.windowTitle}” ({c.corridorCode}) · {c.overlapHours} h overlap
              ({formatDateTime(c.overlapStart)} → {formatDateTime(c.overlapEnd)}) · {severityLabel(c.severity)}
            </li>
          ))}
        </ul>
        {s.total > shown.length && <div className="mt-1">…and {s.total - shown.length} more.</div>}
        {s.unchecked > 0 && <div className="mt-1 opacity-80">{s.unchecked} other consignment{s.unchecked === 1 ? "" : "s"} could not be checked (no schedule or unrecognised corridor).</div>}
        {onOpenPossessions && (
          <button type="button" onClick={onOpenPossessions} className="mt-2 rounded-md border border-current px-2 py-1 text-[11px] font-semibold hover:bg-white/10">
            View possession windows
          </button>
        )}
      </Banner>
    </div>
  );
}
