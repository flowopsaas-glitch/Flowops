import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  closeOccurrence, createOccurrence, filePreliminaryReport, listOccurrences, notifyOccurrence, startInvestigation,
  type OccurrenceLevel, type OccurrenceReport, type OccurrenceType,
} from "../../api/railChangeApi";
import {
  OCCURRENCE_ACTION_LABEL, OCCURRENCE_LEVEL_LABEL, OCCURRENCE_STATUS_LABEL, OCCURRENCE_TYPE_LABEL, formatDateTime, localInputToIso, occurrenceActions,
  occurrenceLevelTone, occurrenceStatusTone, preliminaryClock, type OccurrenceActionKey,
} from "../../lib/railChange";
import { useToast } from "../../components/ToastProvider";
import NoteModal from "./NoteModal";
import { Field, Modal, Pill, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";

type NoteAction = Extract<OccurrenceActionKey, "investigate" | "preliminary" | "close">;
const NOTE_COPY: Record<NoteAction, { title: string; label: string; submit: string; done: string; hint?: string }> = {
  investigate: { title: "Start an investigation", label: "Investigation note", submit: "Start investigation", done: "investigation started" },
  preliminary: { title: "File the preliminary report", label: "Preliminary report", submit: "File report", done: "preliminary report filed", hint: "Due within 48 hours of the occurrence." },
  close: { title: "Close the occurrence", label: "Closing note", submit: "Close occurrence", done: "closed", hint: "Closing is a formal act by an authorised representative." },
};

export default function OccurrencesSection({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<OccurrenceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [noteFor, setNoteFor] = useState<{ occurrence: OccurrenceReport; action: NoteAction } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listOccurrences()); } catch (e) { showToast(`Could not load occurrence reports: ${(e as Error)?.message ?? e}`, "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  async function notify(o: OccurrenceReport, to: "TCO" | "RSR") {
    setBusy(`${o.id}:${to}`);
    try { await notifyOccurrence(o.id, to); showToast(`${o.occurrenceNumber}: ${to === "TCO" ? "Train Control Officer" : "Regulator"} notification recorded`, "success"); await load(); }
    catch (e) { showToast((e as Error)?.message || "Could not record the notification", "error"); } finally { setBusy(""); }
  }

  const overdue = rows.filter((r) => r.preliminaryReportOverdue).length;

  return (
    <Section
      title="Occurrence reports (derailment · collision · theft · SPAD · hazmat)"
      right={canWrite && <button type="button" className={btnPrimary} onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5" /> Report an occurrence</button>}
    >
      {overdue > 0 && (
        <p role="status" data-testid="occurrence-overdue" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
          {overdue} occurrence{overdue === 1 ? "" : "s"} past the 48-hour preliminary-report deadline.
        </p>
      )}
      <div data-testid="occurrence-reports" className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-slate-400">
            <tr><th className="px-3 py-2">Occurrence</th><th className="px-3 py-2">What happened</th><th className="px-3 py-2">Level</th><th className="px-3 py-2">Notified</th><th className="px-3 py-2">Preliminary report</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No occurrences reported.</td></tr>}
            {!loading && rows.map((o) => {
              const clock = preliminaryClock(o);
              return (
                <tr key={o.id} className="align-top">
                  <td className="px-3 py-2 font-mono font-semibold text-emerald-400">{o.occurrenceNumber}<div className="font-sans text-[10px] font-normal text-slate-500">{formatDateTime(o.occurredAt)}</div></td>
                  <td className="px-3 py-2 text-slate-200">
                    {OCCURRENCE_TYPE_LABEL[o.type]}{o.fatalities && <> <Pill tone="danger">Fatalities</Pill></>}{o.hazmatInvolved && <> <Pill tone="warn">Hazmat</Pill></>}
                    <div className="max-w-xs text-[10px] text-slate-500">{[o.corridorCode, o.location].filter(Boolean).join(" · ")}</div>
                    <div className="max-w-xs text-[11px] text-slate-400">{o.description}</div>
                  </td>
                  <td className="px-3 py-2"><Pill tone={occurrenceLevelTone(o.level)}>{OCCURRENCE_LEVEL_LABEL[o.level]}</Pill></td>
                  <td className="px-3 py-2 text-slate-300">
                    <div>TCO: {o.reportedToTcoAt ? formatDateTime(o.reportedToTcoAt) : <span className="text-amber-300">not yet</span>}</div>
                    <div>Regulator: {o.reportedToRsrAt ? formatDateTime(o.reportedToRsrAt) : <span className="text-slate-500">not yet</span>}</div>
                  </td>
                  <td className="px-3 py-2"><Pill tone={clock.tone}>{clock.text}</Pill></td>
                  <td className="px-3 py-2"><Pill tone={occurrenceStatusTone(o.status)}>{OCCURRENCE_STATUS_LABEL[o.status]}</Pill></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {occurrenceActions(o, { canWrite, canSign }).map((a) => (
                        <button
                          key={a} type="button" className={btnNeutral} disabled={busy === `${o.id}:${a === "notify-tco" ? "TCO" : "RSR"}`}
                          onClick={() => (a === "notify-tco" ? void notify(o, "TCO") : a === "notify-rsr" ? void notify(o, "RSR") : setNoteFor({ occurrence: o, action: a }))}
                        >
                          {OCCURRENCE_ACTION_LABEL[a]}
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

      {showNew && canWrite && <OccurrenceModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); void load(); }} />}
      {noteFor && (
        <NoteModal
          title={`${NOTE_COPY[noteFor.action].title} — ${noteFor.occurrence.occurrenceNumber}`} label={NOTE_COPY[noteFor.action].label}
          submitLabel={NOTE_COPY[noteFor.action].submit} hint={NOTE_COPY[noteFor.action].hint} onClose={() => setNoteFor(null)}
          onSubmit={async (note) => {
            const { occurrence, action } = noteFor;
            try {
              await (action === "investigate" ? startInvestigation(occurrence.id, note) : action === "preliminary" ? filePreliminaryReport(occurrence.id, note) : closeOccurrence(occurrence.id, note));
              showToast(`${occurrence.occurrenceNumber}: ${NOTE_COPY[action].done}`, "success");
              setNoteFor(null); await load();
            } catch (e) { showToast((e as Error)?.message || "Action failed", "error"); }
          }}
        />
      )}
    </Section>
  );
}

function OccurrenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [f, setF] = useState({
    type: "DERAILMENT" as OccurrenceType, level: "LEVEL_2_CODE_ORANGE" as OccurrenceLevel, occurredAt: "", description: "",
    corridorCode: "", location: "", trainSlotRef: "", fatalities: false, hazmatInvolved: false,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const occurredAt = localInputToIso(f.occurredAt);
  const corridorOk = !f.corridorCode.trim() || /^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(f.corridorCode.trim());
  const ok = !!occurredAt && f.description.trim().length >= 5 && corridorOk;

  async function submit() {
    if (!ok || !occurredAt) return;
    setBusy(true);
    try {
      const r = await createOccurrence({
        type: f.type, level: f.level, occurredAt, description: f.description.trim(), fatalities: f.fatalities, hazmatInvolved: f.hazmatInvolved,
        ...(f.corridorCode.trim() ? { corridorCode: f.corridorCode.trim() } : {}), ...(f.location.trim() ? { location: f.location.trim() } : {}),
        ...(f.trainSlotRef.trim() ? { trainSlotRef: f.trainSlotRef.trim() } : {}),
      });
      showToast(`${r.occurrenceNumber} reported. Notify the Train Control Officer straight away.`, "success");
      onCreated();
    } catch (e) { showToast((e as Error)?.message || "Could not report the occurrence", "error"); } finally { setBusy(false); }
  }

  return (
    <Modal title="Report an occurrence" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select className={inputCls} value={f.type} onChange={(e) => set({ type: e.target.value as OccurrenceType })}>
            {(Object.keys(OCCURRENCE_TYPE_LABEL) as OccurrenceType[]).map((k) => <option key={k} value={k}>{OCCURRENCE_TYPE_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <select className={inputCls} value={f.level} onChange={(e) => set({ level: e.target.value as OccurrenceLevel })}>
            {(Object.keys(OCCURRENCE_LEVEL_LABEL) as OccurrenceLevel[]).map((k) => <option key={k} value={k}>{OCCURRENCE_LEVEL_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="When it happened"><input type="datetime-local" className={inputCls} value={f.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} /></Field>
        <Field label="Train / slot reference (optional)"><input className={inputCls} value={f.trainSlotRef} maxLength={120} onChange={(e) => set({ trainSlotRef: e.target.value })} /></Field>
        <Field label="Corridor code (optional)">
          <input className={inputCls} value={f.corridorCode} maxLength={40} onChange={(e) => set({ corridorCode: e.target.value.toUpperCase() })} placeholder="e.g. COR-ORE" aria-invalid={!corridorOk} />
        </Field>
        <Field label="Location (optional)"><input className={inputCls} value={f.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="What happened"><textarea className={`${inputCls} min-h-[90px]`} value={f.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.fatalities} onChange={(e) => set({ fatalities: e.target.checked })} /> Fatalities</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.hazmatInvolved || f.type === "HAZMAT_SPILL"} disabled={f.type === "HAZMAT_SPILL"} onChange={(e) => set({ hazmatInvolved: e.target.checked })} /> Hazardous material involved</label>
      </div>
      {!corridorOk && <p role="alert" className="mt-2 text-xs text-rose-300">A corridor code uses capitals, digits and hyphens (e.g. COR-ORE).</p>}
      <p className="mt-2 text-[11px] text-slate-500">The preliminary report is due 48 hours after the occurrence. The report is also written to the audit trail.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={btnNeutral} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!ok || busy} onClick={() => void submit()}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Report occurrence</button>
      </div>
    </Modal>
  );
}
