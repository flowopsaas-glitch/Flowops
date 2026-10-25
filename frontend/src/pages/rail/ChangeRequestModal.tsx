import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  createChange, getCancellationCodes, getChangeWindows, previewChange,
  type CancellationCode, type ChangeInitiator, type ChangeKind, type ChangePreview, type ChangeWindows, type CodeParty, type CreateChangeResult,
} from "../../api/railChangeApi";
import {
  ATTRIBUTION_LABEL, CODE_PARTY_LABEL, COMMERCIAL_WINDOW_LABEL, CONSEQUENCE_LABEL, INITIATOR_LABEL, KIND_LABEL, NOTICE_BAND_LABEL,
  attributionTone, buildChangeBody, consequenceTone, initialChangeForm, isChangeFormReady, type ChangeContext, type ChangeFormState,
} from "../../lib/railChange";
import { useToast } from "../../components/toast-context";
import { Banner, Field, Modal, Pill, btnNeutral, btnPrimary, inputCls } from "./railUi";

const PARTY_ORDER: CodeParty[] = ["RAIL_OPERATIONS", "INFRASTRUCTURE_MANAGER", "FORCE_MAJEURE", "ALLOCATION_REQUIRED"];
const PREVIEW_DEBOUNCE_MS = 250;

/**
 * Annexure 20a / 20b Cancel · Reschedule · Re-plan request.
 *
 * Opened from a consignment (Rail Operations), a slot application, or a Daily Handshake report. As the user fills it in,
 * the SERVER is asked what follows (POST /rail/changes/preview): who bears the cancellation, which notice window it
 * falls in, and the commercial consequence. The modal shows that answer verbatim and never works it out itself, and it
 * will not submit until the server has answered for the current inputs.
 */
export default function ChangeRequestModal({
  context = {}, trainSlotRefSuggestions = [], onClose, onCreated,
}: {
  context?: ChangeContext;
  trainSlotRefSuggestions?: string[];
  onClose: () => void;
  onCreated: (r: CreateChangeResult) => void;
}) {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<CancellationCode[]>([]);
  const [windows, setWindows] = useState<ChangeWindows | null>(null);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [codeFilter, setCodeFilter] = useState("");
  const [form, setForm] = useState<ChangeFormState>(() => initialChangeForm(context));
  const [previewState, setPreviewState] = useState<{ key: string; preview: ChangePreview | null; error: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const set = (patch: Partial<ChangeFormState>) => setForm((f) => ({ ...f, ...patch }));

  const loadReference = () => (async () => {
    const [c, w] = await Promise.all([getCancellationCodes(), getChangeWindows().catch(() => null)]);
    setCodes(c); setWindows(w);

  })().catch((e) => {
    setCodesError((e as Error)?.message ?? "Could not load the Annexure 20b reasons.");

  });
  useEffect(() => { void loadReference(); }, []);

  // The body for preview and create is the same object.
  const body = useMemo(() => buildChangeBody(form, context), [form, context]);
  const bodyKey = JSON.stringify(body);
  const ready = isChangeFormReady(form);

  // The preview is keyed by the exact request body it was computed for:
  // while the form differs from the keyed body (debounce/fetch in flight) the
  // preview reads as "previewing" and no stale consequence is shown.
  const preview = ready && previewState?.key === bodyKey ? previewState.preview : null;
  const previewError = ready && previewState?.key === bodyKey ? previewState.error : null;
  const previewing = ready && previewState?.key !== bodyKey;

  useEffect(() => {
    if (!ready) return undefined;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const p = await previewChange(JSON.parse(bodyKey));
        if (!stale) setPreviewState({ key: bodyKey, preview: p, error: null });
      } catch (e) {
        if (!stale) setPreviewState({ key: bodyKey, preview: null, error: (e as Error)?.message ?? "The consequence could not be worked out." });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [ready, bodyKey]);

  const groups = useMemo(() => {
    const q = codeFilter.trim().toLowerCase();
    const visible = codes.filter((c) => c.code === form.cancellationCode || !q || `${c.code} ${c.reason}`.toLowerCase().includes(q));
    return PARTY_ORDER.map((party) => ({ party, items: visible.filter((c) => c.responsibleParty === party) })).filter((g) => g.items.length > 0);
  }, [codes, codeFilter, form.cancellationCode]);
  const chosen = codes.find((c) => c.code === form.cancellationCode);

  async function submit() {
    setSubmitting(true); setSubmitError(null);
    try {
      const result = await createChange(body);
      showToast(`${result.request.requestNumber} logged${context.handshakeReportId ? " and added to the Daily Handshake report" : ""}`, "success");
      onCreated(result);
    } catch (e) {
      const msg = (e as Error)?.message ?? "Could not log the request";
      setSubmitError(msg);
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = ready && !!preview && !previewing && !previewError && !submitting;
  const hours = preview?.notice.hoursBeforeDeparture;

  return (
    <Modal title="Cancel / reschedule a train (Annexure 20a · 20b)" onClose={onClose} wide>
      {context.handshakeReportId && (
        <Banner tone="info" title="Will also be logged in the open Daily Handshake report">
          The request is added to this report as a deviation (Annexure 20a step 7), with the responsible party the server derives below.
        </Banner>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="What is being requested">
          <select className={inputCls} value={form.kind} onChange={(e) => set({ kind: e.target.value as ChangeKind })}>
            {(Object.keys(KIND_LABEL) as ChangeKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Raised by">
          <select className={inputCls} value={form.initiatedBy} onChange={(e) => set({ initiatedBy: e.target.value as ChangeInitiator })}>
            {(Object.keys(INITIATOR_LABEL) as ChangeInitiator[]).map((k) => <option key={k} value={k}>{INITIATOR_LABEL[k]}</option>)}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Find a reason (Annexure 20b)">
            <input className={inputCls} value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} placeholder="Type to narrow the list of reasons…" />
          </Field>
          <div className="mt-2">
            <Field label="Cancellation reason (Annexure 20b)">
              <select
                aria-label="Cancellation reason (Annexure 20b)" className={inputCls} value={form.cancellationCode}
                onChange={(e) => set({ cancellationCode: e.target.value })} disabled={codes.length === 0}
              >
                <option value="">{codes.length === 0 ? (codesError ? "Reasons unavailable" : "Loading reasons…") : "Select a reason…"}</option>
                {groups.map((g) => (
                  <optgroup key={g.party} label={CODE_PARTY_LABEL[g.party]}>
                    {g.items.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.reason}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>
          {codesError && (
            <div role="alert" className="mt-1 text-xs text-rose-300">
              {codesError} <button type="button" className="underline" onClick={() => void loadReference()}>Retry</button>
            </div>
          )}
          {chosen && <p className="mt-1 text-[11px] text-slate-500">Annexure 20b allocation: {chosen.sourceText}</p>}
        </div>

        <Field label="Train / slot reference">
          <input
            className={inputCls} value={form.trainSlotRef} onChange={(e) => set({ trainSlotRef: e.target.value })} maxLength={120} list="change-slot-refs"
            placeholder="e.g. the train service or slot number"
          />
          {trainSlotRefSuggestions.length > 0 && (
            <datalist id="change-slot-refs">{trainSlotRefSuggestions.map((r) => <option key={r} value={r} />)}</datalist>
          )}
        </Field>
        <Field label="Scheduled departure (original)">
          <input type="datetime-local" className={inputCls} value={form.originalDeparture} onChange={(e) => set({ originalDeparture: e.target.value })} />
        </Field>

        {form.kind !== "CANCEL" && (
          <Field label="Proposed new departure">
            <input type="datetime-local" className={inputCls} value={form.proposedDeparture} onChange={(e) => set({ proposedDeparture: e.target.value })} />
          </Field>
        )}
        <Field label="When the cause happened (optional)">
          <input type="datetime-local" className={inputCls} value={form.eventOccurredAt} onChange={(e) => set({ eventOccurredAt: e.target.value })} />
          {windows && <span className="mt-1 block text-[11px] text-slate-500">Notice is due within {windows.windows.noticeWithinMinutes} minutes of the event or its discovery.</span>}
        </Field>

        <label className="flex items-start gap-2 text-sm text-slate-200 sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={form.isPlannedOccupation} onChange={(e) => set({ isPlannedOccupation: e.target.checked })} />
          <span>This is a planned occupation <span className="block text-[11px] text-slate-500">Only affects TRIM-caused cancellations (a planned occupation is excluded from the TRIM-failure remedies).</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200 sm:col-span-2">
          <input type="checkbox" checked={form.requiresStaging} onChange={(e) => set({ requiresStaging: e.target.checked })} /> The train needs to be staged
        </label>
        <div className="sm:col-span-2">
          <Field label="Note (optional)">
            <textarea className={`${inputCls} min-h-[70px]`} value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={2000} />
          </Field>
        </div>
      </div>

      {/* The server's answer — shown verbatim */}
      <div className="mt-4" aria-live="polite">
        {!ready && <p className="text-xs text-slate-500">Choose a reason and name the train to see the consequence.</p>}
        {ready && previewing && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working out the consequence…</p>}
        {ready && previewError && <p role="alert" className="text-xs text-rose-300">{previewError}</p>}
        {preview && !previewing && (
          <div data-testid="change-preview" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Consequence — calculated by the server</div>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Responsible party</dt>
                <dd className="mt-0.5"><Pill tone={attributionTone(preview.attribution)}>{ATTRIBUTION_LABEL[preview.attribution]}</Pill></dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Annexure 20b allocation</dt>
                <dd className="mt-0.5 text-slate-200">{CODE_PARTY_LABEL[preview.code.responsibleParty]}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Notice given</dt>
                <dd className="mt-0.5 text-slate-200">
                  {NOTICE_BAND_LABEL[preview.notice.noticeBand]}{hours != null ? ` (${Math.round(hours * 10) / 10} h before departure)` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">72-hour commercial window</dt>
                <dd className="mt-0.5 text-slate-200">{COMMERCIAL_WINDOW_LABEL[preview.notice.commercialWindow]}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill tone={consequenceTone(preview.consequence.consequence)}>{CONSEQUENCE_LABEL[preview.consequence.consequence]}</Pill>
              <span className="text-xs text-slate-400">
                {preview.consequence.penaltyApplicable ? `Penalty applies against ${preview.consequence.penaltyAgainst}` : "No penalty applies yet"}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-300">{preview.consequence.basis}</p>
            {preview.needsClearinghouseAllocation && (
              <p className="mt-2 text-xs text-amber-300">This reason is “could be …” in Annexure 20b: an authorised representative records the Clearinghouse allocation after the request is logged.</p>
            )}
            {preview.consequence.caveats.map((c) => <p key={c} className="mt-1 text-[11px] text-slate-500">{c}</p>)}
            {preview.warnings.length > 0 && (
              <ul data-testid="change-warnings" className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-300">
                {preview.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {submitError && <p role="alert" className="mt-3 text-xs text-rose-300">{submitError}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnNeutral} onClick={onClose}>Close</button>
        <button type="button" className={btnPrimary} disabled={!canSubmit} onClick={() => void submit()}>
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Log {KIND_LABEL[form.kind].toLowerCase()} request
        </button>
      </div>
    </Modal>
  );
}
