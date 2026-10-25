import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  allocateParty, changeAction, getCancellationCodes, listChanges, proposeAlternative,
  type Attribution, type CancellationCode, type ChangeAction, type ChangeRequest,
} from "../../api/railChangeApi";
import {
  ACK_LABEL, ATTRIBUTION_LABEL, CHANGE_ACTION_DONE, CHANGE_ACTION_LABEL, CHANGE_STATUS_LABEL, COMMERCIAL_WINDOW_LABEL, CONSEQUENCE_LABEL, INITIATOR_LABEL, KIND_LABEL, NOTICE_BAND_LABEL,
  ackTone, allowedAttributions, attributionTone, availableChangeActions, changeStatusTone, consequenceTone, formatDateTime, localInputToIso, type ChangeActionKey,
} from "../../lib/railChange";
import { useToast } from "../../components/toast-context";
import ChangeRequestModal from "./ChangeRequestModal";
import NoteModal from "./NoteModal";
import { Field, Modal, Pill, Section, btnNeutral, btnPrimary, btnWarn, inputCls } from "./railUi";

const CONFIRM_TEXT: Partial<Record<ChangeActionKey, string>> = {
  "confirm-cancellation": "Confirm that the cancellation stands (no replacement train path was taken up)? This settles the commercial consequence.",
  accept: "Record that the replacement train path was accepted? Any “replacement not accepted” refund then falls away.",
  close: "Close this request?",
};

export default function ChangeRequestsSection({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [propose, setPropose] = useState<ChangeRequest | null>(null);
  const [allocate, setAllocate] = useState<ChangeRequest | null>(null);

  const load = useCallback(() => (async () => {
    setRows(await listChanges());
    setLoadError(null);

  })().catch((e) => {
    const message = String((e as Error)?.message ?? e);
    setRows([]);
    setLoadError(message);
    showToast(`Could not load change requests: ${message}`, "error");

  }).finally(() => {
    setLoading(false);

  }), [showToast]);
  useEffect(() => { void load(); }, [load]);

  async function run(req: ChangeRequest, action: ChangeActionKey) {
    if (action === "propose-alternative") return setPropose(req);
    if (action === "allocate-party") return setAllocate(req);
    const confirmText = CONFIRM_TEXT[action];
    if (confirmText && !window.confirm(confirmText)) return undefined;
    setBusy(`${req.id}:${action}`);
    try {
      await changeAction(req.id, action as ChangeAction);
      showToast(`${req.requestNumber}: ${CHANGE_ACTION_DONE[action]}`, "success");
      await load();
    } catch (e) {
      showToast((e as Error)?.message || "Action failed", "error");
    } finally {
      setBusy("");
    }
    return undefined;
  }

  return (
    <Section
      title="Cancellations & reschedules (Annexure 20a · 20b)"
      right={canWrite && <button type="button" className={btnPrimary} onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5" /> New cancel / reschedule</button>}
    >
      {loadError && (
        <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
          Change-request records unavailable: {loadError}.{" "}
          <button type="button" onClick={() => void load()} className="underline underline-offset-2">Retry</button>
        </div>
      )}
      <div data-testid="change-requests" className="overflow-x-auto rounded-xl border border-white/10">
        <table aria-label="Rail cancellation and reschedule requests" className="min-w-[1000px] w-full text-left text-xs">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-3 py-2">Request</th><th className="px-3 py-2">Train</th><th className="px-3 py-2">Reason (20b)</th><th className="px-3 py-2">Responsible</th>
              <th className="px-3 py-2">Notice</th><th className="px-3 py-2">Consequence</th><th className="px-3 py-2">IM acknowledgement</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500"><div role="status"><Loader2 className="mx-auto h-5 w-5 animate-spin" />Loading change requests…</div></td></tr>}
            {!loading && !loadError && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No cancellations or reschedules logged.</td></tr>}
            {!loading && rows.map((r) => {
              const actions = availableChangeActions(r, { canWrite, canSign });
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 font-mono font-semibold text-emerald-400">{r.requestNumber}<div className="font-sans text-[10px] font-normal text-slate-500">{formatDateTime(r.requestedAt)}</div></td>
                  <td className="px-3 py-2 text-slate-200">{KIND_LABEL[r.kind]} · {r.trainSlotRef}<div className="text-[10px] text-slate-500">by {INITIATOR_LABEL[r.initiatedBy]}</div></td>
                  <td className="px-3 py-2 text-slate-300"><span className="font-mono text-[10px] text-slate-500">{r.cancellationCode}</span> {r.cancellationReason}</td>
                  <td className="px-3 py-2"><Pill tone={attributionTone(r.attribution)}>{ATTRIBUTION_LABEL[r.attribution]}</Pill></td>
                  <td className="px-3 py-2 text-slate-300">{NOTICE_BAND_LABEL[r.noticeBand]}<div className="text-[10px] text-slate-500">{COMMERCIAL_WINDOW_LABEL[r.commercialWindow]}</div></td>
                  <td className="px-3 py-2">
                    <Pill tone={consequenceTone(r.consequence)}>{CONSEQUENCE_LABEL[r.consequence]}</Pill>
                    {r.penaltyBasis && <div className="mt-1 max-w-xs text-[10px] text-slate-500">{r.penaltyBasis}</div>}
                  </td>
                  <td className="px-3 py-2"><Pill tone={ackTone(r.acknowledgement)}>{ACK_LABEL[r.acknowledgement]}</Pill></td>
                  <td className="px-3 py-2"><Pill tone={changeStatusTone(r.status)}>{CHANGE_STATUS_LABEL[r.status]}</Pill></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((a) => (
                        <button
                          key={a} type="button" disabled={busy === `${r.id}:${a}`} className={a === "allocate-party" ? btnWarn : btnNeutral} onClick={() => void run(r, a)}
                        >
                          {a === "allocate-party" && r.attribution !== "UNDETERMINED" ? "Change allocation" : CHANGE_ACTION_LABEL[a]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && canWrite && (
        <ChangeRequestModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); void load(); }} />
      )}
      {propose && <ProposeModal req={propose} onClose={() => setPropose(null)} onDone={() => { setPropose(null); void load(); }} />}
      {allocate && <AllocateModal req={allocate} onClose={() => setAllocate(null)} onDone={() => { setAllocate(null); void load(); }} />}
    </Section>
  );
}

function ProposeModal({ req, onClose, onDone }: { req: ChangeRequest; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const iso = localInputToIso(when);
  async function submit() {
    if (!iso) return;
    setBusy(true);
    try {
      await proposeAlternative(req.id, { proposedDeparture: iso, ...(note.trim() ? { note: note.trim() } : {}) });
      showToast(`${req.requestNumber}: alternative proposed`, "success");
      onDone();
    } catch (e) { showToast((e as Error)?.message || "Could not propose the alternative", "error"); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Propose an alternative — ${req.requestNumber}`} onClose={onClose}>
      <Field label="Replacement departure"><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <div className="mt-3"><Field label="Note (optional)"><textarea className={`${inputCls} min-h-[70px]`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></Field></div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={btnNeutral} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!iso || busy} onClick={() => void submit()}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Propose</button>
      </div>
    </Modal>
  );
}

/** Signatory-only: record the Clearinghouse's decision for a “could be …” reason. The server restricts the party to those the annexure names. */
function AllocateModal({ req, onClose, onDone }: { req: ChangeRequest; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<CancellationCode[] | null>(null);
  const [party, setParty] = useState<Exclude<Attribution, "UNDETERMINED"> | "">("");
  useEffect(() => { getCancellationCodes().then(setCodes).catch(() => setCodes([])); }, []);
  const code = codes?.find((c) => c.code === req.cancellationCode);
  // If the reason cannot be found, offer all three and let the server enforce the annexure's list.
  const options = code ? allowedAttributions(code.possibleParties) : (["TRIM", "TOC", "FORCE_MAJEURE"] as const);
  return (
    <NoteModal
      title={`Allocate the responsible party — ${req.requestNumber}`} label="Clearinghouse reference / decision" minLength={3} submitLabel="Record allocation"
      hint={`“${req.cancellationReason}” is a “could be …” reason in Annexure 20b. This decides who bears the commercial consequence.`}
      onClose={onClose}
      onSubmit={async (note) => {
        if (!party) { showToast("Choose the party the Clearinghouse allocated.", "error"); return; }
        try { await allocateParty(req.id, { attribution: party, note }); showToast(`${req.requestNumber}: allocated to ${ATTRIBUTION_LABEL[party]}`, "success"); onDone(); }
        catch (e) { showToast((e as Error)?.message || "Could not record the allocation", "error"); }
      }}
    >
      <Field label="Allocated to">
        <select className={inputCls} value={party} onChange={(e) => setParty(e.target.value as typeof party)}>
          <option value="">Select a party…</option>
          {options.map((a) => <option key={a} value={a}>{ATTRIBUTION_LABEL[a]}</option>)}
        </select>
      </Field>
    </NoteModal>
  );
}
