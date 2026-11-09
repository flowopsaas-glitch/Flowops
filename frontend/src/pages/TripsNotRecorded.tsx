import { Link } from "react-router-dom";
import { ClipboardList, FileText, Train } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/patterns";

/**
 * `/transactions/trips` — kept as a page rather than a 404 so an existing
 * bookmark or a link in someone's notes lands somewhere that explains itself.
 *
 * There is no trip event table in the schema. Trips have a current status, not
 * a recorded history of state changes, so any "Trip Transactions" list would
 * have to be reconstructed after the fact and presented as if it had been
 * recorded. It is not shown at all instead — and the nav entry that promised it
 * has been removed.
 */
export default function TripsNotRecorded() {
  return (
    <div className="min-h-full bg-[#07111f]">
      <PageHeader
        title="Trip Transactions"
        description="Trips are not event-sourced in FlowOps."
        className="mb-6"
      />

      <EmptyState
        icon={<ClipboardList size={22} strokeWidth={2} />}
        title="Trip state changes are not recorded as an event trail"
        description="FlowOps records a movement and status trail for waybills and rail consignments. A trip carries its current status only, so a per-trip change history cannot be shown without reconstructing it — which this platform will not present as recorded history."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/transactions/waybills"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              <FileText size={15} strokeWidth={2} aria-hidden />
              Waybill events
            </Link>
            <Link
              to="/transactions"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              <Train size={15} strokeWidth={2} aria-hidden />
              Full event trail
            </Link>
          </div>
        }
      />
    </div>
  );
}
