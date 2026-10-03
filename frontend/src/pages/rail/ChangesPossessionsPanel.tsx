import ChangeRequestsSection from "./ChangeRequestsSection";
import OccurrencesSection from "./OccurrencesSection";
import PossessionsSection from "./PossessionsSection";

/**
 * "Changes & Possessions" tab: cancellations / reschedules (Annexure 20a · 20b), IM possession windows with conflict
 * detection, and safety / security occurrence reports. `canWrite` and `canSign` only decide which buttons are shown;
 * the API enforces the same roles (rail-roles.ts).
 */
export default function ChangesPossessionsPanel({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) {
  return (
    <div data-testid="changes-possessions-panel">
      <ChangeRequestsSection canWrite={canWrite} canSign={canSign} />
      <PossessionsSection canWrite={canWrite} />
      <OccurrencesSection canWrite={canWrite} canSign={canSign} />
    </div>
  );
}
