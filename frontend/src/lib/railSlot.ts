import type {
  EffectiveDocStatus, EnvelopeStatus, MobilisationState, RsrGuardLevel, SlotApplicationStatus,
} from "../api/railSlotApi";

/**
 * Presentation helpers for the Slot Applications & Compliance tab. Pure, so the colour and wording
 * rules are unit-tested. The 60-day clock itself is computed on the SERVER (backend rail-slot.rules);
 * the UI only displays it — it never recomputes a deadline.
 */

export type Tone = "ok" | "info" | "warn" | "danger" | "muted";

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  danger: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  muted: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export const mobilisationTone = (state: MobilisationState): Tone =>
  ({ NOT_ALLOCATED: "muted", ON_TRACK: "ok", DUE_SOON: "warn", OVERDUE: "danger", FORFEITURE_FLAGGED: "danger", OPERATED: "info", CLOSED: "muted" } as const)[state];

/** Whether the countdown badge should be shown at all (there is a clock only once allocated). */
export const hasMobilisationClock = (state: MobilisationState): boolean => state !== "NOT_ALLOCATED" && state !== "CLOSED";

export const rsrTone = (level: RsrGuardLevel): Tone =>
  ({ OK: "ok", WARNING: "warn", CRITICAL: "danger", EXPIRED: "danger", MISSING: "danger", PENDING_REVIEW: "info" } as const)[level];

/** True when the guard must stop the user: submissions and operation are hard-blocked. */
export const rsrBlocksSubmission = (level: RsrGuardLevel): boolean => level === "EXPIRED" || level === "MISSING" || level === "PENDING_REVIEW";

export const docTone = (s: EffectiveDocStatus): Tone =>
  ({ VALID: "ok", PENDING_REVIEW: "info", NOT_YET_VALID: "warn", EXPIRED: "danger", REVOKED: "danger" } as const)[s];

export const envelopeTone = (s: EnvelopeStatus): Tone => ({ COMPATIBLE: "ok", INCOMPATIBLE: "danger", UNVERIFIED: "warn" } as const)[s];

export const envelopeLabel = (s: EnvelopeStatus): string =>
  ({ COMPATIBLE: "Compatible", INCOMPATIBLE: "Incompatible — rejected", UNVERIFIED: "Unverified — fit not confirmed" } as const)[s];

export const slotStatusTone = (s: SlotApplicationStatus): Tone =>
  ({ DRAFT: "muted", SUBMITTED: "info", UNDER_ASSESSMENT: "info", CAPACITY_CONFLICT: "warn", ALLOCATED: "ok", REJECTED: "danger", EXPIRED: "muted" } as const)[s];

/** "12 days left", "expires today", "expired 3 days ago". */
export function describeDaysLeft(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days === 0) return "expires today";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} left`;
  const n = Math.abs(days);
  return `expired ${n} day${n === 1 ? "" : "s"} ago`;
}

export const formatDate = (iso?: string | null): string => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

/**
 * The actions a user may take on an application in each state. The server enforces the same state
 * machine; this only decides which buttons to show.
 */
export function availableActions(status: SlotApplicationStatus, opts: { canWrite: boolean; canSign: boolean; operated: boolean }): string[] {
  const { canWrite, canSign, operated } = opts;
  const out: string[] = [];
  if (status === "DRAFT") { if (canSign) out.push("submit"); }
  if (!canWrite) return out;
  if (status === "SUBMITTED") out.push("assess", "reject");
  if (status === "UNDER_ASSESSMENT") out.push("conflict", "allocate", "reject");
  if (status === "CAPACITY_CONFLICT") out.push("resolve-conflict", "allocate", "reject");
  if (status === "ALLOCATED") { if (!operated) out.push("operated"); out.push("link", "expire"); }
  return out;
}
