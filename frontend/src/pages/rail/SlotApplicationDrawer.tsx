import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  allocateSlotApplication, assessSlotApplication, expireSlotApplication, flagSlotConflict, getSelfScreeningForm, getSlotApplication,
  getSlotReadiness, linkSlotConsignment, markSlotOperated, rejectSlotApplication, resolveSlotConflict, saveSelfScreening,
  submitSlotApplication, ELECTRIFICATION_LABEL, GAUGE_LABEL, PROFILE_LABEL, SLOT_STATUS_LABEL,
  type Corridor, type Readiness, type SelfScreeningAnswer, type SelfScreeningQuestion, type SlotApplication,
} from "../../api/railSlotApi";
import type { RailConsignment } from "../../api/railApi";
import {
  availableActions, envelopeLabel, envelopeTone, formatDate, hasMobilisationClock, mobilisationTone, slotStatusTone,
} from "../../lib/railSlot";
import { useToast } from "../../components/ToastProvider";
import { useDismissOnEscape } from "../../components/patterns";
import { EnvelopeResultCard } from "./EnvelopeChecker";
import { Banner, Field, Modal, Pill, btnDanger, btnNeutral, btnPrimary, btnWarn, inputCls } from "./railUi";

type Props = {
  id: string;
  canWrite: boolean;
  canSign: boolean;
  corridors: Corridor[];
  consignments: RailConsignment[];
  onClose: () => void;
  onChanged: () => void;
};

export function MobilisationBadge({ app }: { app: Pick<SlotApplication, "mobilisation"> }) {
  const m = app.mobilisation;
  if (!hasMobilisationClock(m.state)) return <span className="text-xs text-slate-500">—</span>;
  return (
    <Pill tone={mobilisationTone(m.state)} title={m.mobilizeBy ? `Mobilise by ${formatDate(m.mobilizeBy)} (allocation + 60 days)` : undefined}>
      {m.label}
    </Pill>
  );
}

export default function SlotApplicationDrawer({ id, canWrite, canSign, corridors, consignments, onClose, onChanged }: Props) {
  const { showToast } = useToast();
  const [app, setApp] = useState<SlotApplication | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [questions, setQuestions] = useState<SelfScreeningQuestion[]>([]);
  const [version, setVersion] = useState("");
  const [answers, setAnswers] = useState<Record<string, { answer?: "YES" | "NO"; remarks: string }>>({});
  const [accessType, setAccessType] = useState<"Network A" | "Network B" | "">("");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState<"allocate" | "link" | null>(null);
  const [allocDate, setAllocDate] = useState("");
  const [imRef, setImRef] = useState("");
  const [linkId, setLinkId] = useState("");
  useDismissOnEscape(!modal, onClose);

  const load = useCallback(async () => {
    const a = await getSlotApplication(id);
    setApp(a);
    const saved: Record<string, { answer?: "YES" | "NO"; remarks: string }> = {};
    for (const x of a.selfScreening?.answers ?? []) saved[x.no] = { answer: x.answer, remarks: x.remarks ?? "" };
    setAnswers(saved);
    setAccessType((a.selfScreeningAccessType as "Network A" | "Network B" | null) ?? "");
    setReadiness(a.status === "DRAFT" ? await getSlotReadiness(id).catch(() => null) : null);
  }, [id]);

  useEffect(() => {
    void load().catch((e) => showToast((e as Error)?.message || "Could not open the application", "error"));
    void getSelfScreeningForm().then((f) => { setQuestions(f.questions); setVersion(f.version); }).catch(() => undefined);
  }, [load, showToast]);

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      showToast(ok, "success");
      await load();
      onChanged();
    } catch (e) {
      showToast((e as Error)?.message || "Action failed", "error");
    } finally {
      setBusy("");
    }
  }

  if (!app) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
        <div className="grid h-full w-full max-w-2xl place-items-center border-l border-white/10 bg-[#0b0f14]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      </div>
    );
  }

  const corridor = corridors.find((c) => c.code === app.corridorCode);
  const actions = availableActions(app.status, { canWrite, canSign, operated: !!app.firstOperatedAt });
  const editable = app.status === "DRAFT" && canWrite;

  const saveForm = () => {
    const list: SelfScreeningAnswer[] = Object.entries(answers)
      .filter(([, v]) => v.answer)
      .map(([no, v]) => ({ no, answer: v.answer as "YES" | "NO", remarks: v.remarks.trim() || undefined }));
    return act("screening", () => saveSelfScreening(app.id, { accessType: accessType || undefined, answers: list }), "Self-screening saved");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0b0f14] p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Slot application ${app.applicationNumber}`}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-lg font-black text-emerald-400">{app.applicationNumber}</h2>
              <Pill tone={slotStatusTone(app.status)}>{SLOT_STATUS_LABEL[app.status]}</Pill>
              <MobilisationBadge app={app} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{corridor?.name ?? app.corridorCode} corridor{app.commodity ? ` · ${app.commodity}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"><X className="h-5 w-5" /></button>
        </div>

        {app.forfeitureFlaggedAt && !app.firstOperatedAt && (
          <Banner tone="danger" title="Flagged for forfeiture">
            This slot was not operated within 60 days of allocation (mobilise-by {formatDate(app.mobilizeBy)}). Contact your IM liaison.
          </Banner>
        )}
        {app.status === "CAPACITY_CONFLICT" && app.conflictNote && <Banner tone="warn" title="Capacity conflict">{app.conflictNote}</Banner>}
        {app.status === "REJECTED" && app.rejectionReason && <Banner tone="danger" title="Rejected">{app.rejectionReason}</Banner>}

        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          {([
            ["Requested window", `${formatDate(app.requestedFrom)} → ${formatDate(app.requestedUntil)}`],
            ["Allocated window", app.validFrom ? `${formatDate(app.validFrom)} → ${formatDate(app.validUntil)}` : "—"],
            ["Allocated", formatDate(app.allocatedAt)], ["Mobilise by", formatDate(app.mobilizeBy)],
            ["First operated", formatDate(app.firstOperatedAt)], ["IM reference", app.imReference || "—"],
            ["Origin → destination", `${app.originName || "—"} → ${app.destinationName || "—"}`],
            ["Traction", app.tractionType ? ELECTRIFICATION_LABEL[app.tractionType] : "—"],
            ["Gauge", app.gauge ? GAUGE_LABEL[app.gauge] : "not declared"], ["Axle load", app.axleLoadTonnes != null ? `${app.axleLoadTonnes} t` : "not declared"],
            ["Vehicle profile", app.vehicleProfile ? PROFILE_LABEL[app.vehicleProfile] : "not declared"], ["Dangerous goods", app.isDangerousGoods ? "Yes" : "No"],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>

        {app.envelopeCheckStatus && (
          <p className="mt-3 text-xs text-slate-400">
            Envelope at submission: <Pill tone={envelopeTone(app.envelopeCheckStatus)}>{envelopeLabel(app.envelopeCheckStatus)}</Pill>
          </p>
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        {actions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Actions">
            {actions.includes("submit") && (
              <button className={btnPrimary} disabled={!!busy || (readiness != null && readiness.blockers.length > 0)}
                title={readiness?.blockers.length ? "Resolve the blockers below first" : undefined}
                onClick={() => act("submit", () => submitSlotApplication(app.id), "Application submitted")}>Submit application</button>
            )}
            {actions.includes("assess") && <button className={btnNeutral} disabled={!!busy} onClick={() => act("assess", () => assessSlotApplication(app.id), "Assessment started")}>Start assessment</button>}
            {actions.includes("conflict") && (
              <button className={btnWarn} disabled={!!busy} onClick={() => {
                const note = window.prompt("Describe the capacity conflict (what clashes, with whom):");
                if (note && note.trim().length >= 3) void act("conflict", () => flagSlotConflict(app.id, note.trim()), "Capacity conflict recorded");
              }}>Flag capacity conflict</button>
            )}
            {actions.includes("resolve-conflict") && <button className={btnNeutral} disabled={!!busy} onClick={() => act("resolve", () => resolveSlotConflict(app.id), "Conflict resolved")}>Resolve conflict</button>}
            {actions.includes("allocate") && <button className={btnPrimary} disabled={!!busy} onClick={() => setModal("allocate")}>Record allocation</button>}
            {actions.includes("reject") && (
              <button className={btnDanger} disabled={!!busy} onClick={() => {
                const reason = window.prompt("Reason the IM rejected this application:");
                if (reason && reason.trim().length >= 3) void act("reject", () => rejectSlotApplication(app.id, reason.trim()), "Application rejected");
              }}>Record rejection</button>
            )}
            {actions.includes("operated") && <button className={btnPrimary} disabled={!!busy} onClick={() => act("operated", () => markSlotOperated(app.id), "Operation recorded — mobilisation clock stopped")}>Mark first operation</button>}
            {actions.includes("link") && <button className={btnNeutral} disabled={!!busy} onClick={() => setModal("link")}>Link consignment</button>}
            {actions.includes("expire") && (
              <button className={btnDanger} disabled={!!busy} onClick={() => { if (window.confirm("Mark this allocation as expired?")) void act("expire", () => expireSlotApplication(app.id), "Allocation expired"); }}>Mark expired</button>
            )}
          </div>
        )}

        {/* ── Readiness (draft) ───────────────────────────────────────────── */}
        {app.status === "DRAFT" && readiness && (
          <div className="mt-5" data-testid="readiness">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-300">Submission readiness</h3>
            {readiness.blockers.length === 0 ? (
              <Banner tone="ok" title="All hard gates pass">{readiness.notes[0] ?? "Annexure 25, compliance documents and the corridor envelope are satisfied."}</Banner>
            ) : (
              <Banner tone="danger" title={`${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? "" : "s"} — cannot be submitted yet`}>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </Banner>
            )}
            <EnvelopeResultCard result={{ ...readiness.envelope, source: "MANUAL", consignment: null, corridor: corridor ? { code: corridor.code, name: corridor.name, dataStatus: corridor.dataStatus } : null, corridorQuery: app.corridorCode }} />
          </div>
        )}

        {/* ── Annexure 25 ─────────────────────────────────────────────────── */}
        <div className="mt-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Annexure 25 — TOC self-screening</h3>
          <p className="mb-3 text-xs text-slate-500">
            {version ? `Form version: ${version}. ` : ""}The cover page of the application. A “No” is flagged for the IM’s attention and needs remarks; it does not block submission.
          </p>
          <div className="mb-3 max-w-xs">
            <Field label="Access application type">
              <select className={inputCls} disabled={!editable} value={accessType} onChange={(e) => setAccessType(e.target.value as typeof accessType)} aria-label="Access application type">
                <option value="">Not stated</option><option value="Network A">Network A</option><option value="Network B">Network B</option>
              </select>
            </Field>
          </div>
          <ol className="space-y-3">
            {questions.map((q) => {
              const a = answers[q.no] ?? { remarks: "" };
              return (
                <li key={q.no} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-xs text-slate-300"><span className="mr-1 font-mono text-slate-500">({q.no})</span>{q.assessment}</div>
                  {q.evidenceRequested && <div className="mt-1 text-[11px] text-slate-500">Evidence: {q.evidenceRequested}</div>}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {(["YES", "NO"] as const).map((v) => (
                      <label key={v} className="inline-flex items-center gap-1.5 text-xs text-slate-200">
                        <input type="radio" name={`q-${q.no}`} disabled={!editable} checked={a.answer === v} aria-label={`Question ${q.no} ${v}`}
                          onChange={() => setAnswers((s) => ({ ...s, [q.no]: { ...a, answer: v } }))} />
                        {v === "YES" ? "Yes" : "No"}
                      </label>
                    ))}
                    {a.answer === "NO" && (
                      <input className={`${inputCls} flex-1`} disabled={!editable} placeholder="Remarks (required for a No)" aria-label={`Question ${q.no} remarks`}
                        value={a.remarks} onChange={(e) => setAnswers((s) => ({ ...s, [q.no]: { ...a, remarks: e.target.value } }))} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {editable && <div className="mt-3"><button className={btnPrimary} disabled={!!busy} onClick={saveForm}>Save self-screening</button></div>}
        </div>

        {/* ── Modals ──────────────────────────────────────────────────────── */}
        {modal === "allocate" && (
          <Modal title="Record the IM allocation" onClose={() => setModal(null)}>
            <p className="mb-3 text-xs text-slate-400">Starts the <b>60-day mobilisation clock</b>: the slot must be operated within 60 days of the allocation date, or it is flagged for forfeiture.</p>
            <Field label="Allocation date (blank = today)"><input type="date" className={inputCls} value={allocDate} onChange={(e) => setAllocDate(e.target.value)} aria-label="Allocation date" /></Field>
            <div className="mt-3"><Field label="IM reference (TOL)"><input className={inputCls} value={imRef} onChange={(e) => setImRef(e.target.value)} aria-label="IM reference" /></Field></div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnNeutral} onClick={() => setModal(null)}>Cancel</button>
              <button className={btnPrimary} disabled={!!busy} onClick={async () => {
                await act("allocate", () => allocateSlotApplication(app.id, { allocatedAt: allocDate ? new Date(allocDate).toISOString() : undefined, imReference: imRef || undefined }), "Allocation recorded — 60-day clock started");
                setModal(null);
              }}>Record allocation</button>
            </div>
          </Modal>
        )}
        {modal === "link" && (
          <Modal title="Link a consignment" onClose={() => setModal(null)}>
            <p className="mb-3 text-xs text-slate-400">The link is <b>rejected</b> if a wagon’s gauge or axle load violates the corridor’s verified limits.</p>
            <Field label="Consignment">
              <select className={inputCls} value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label="Consignment to link">
                <option value="">Select a consignment</option>
                {consignments.map((c) => <option key={c.id} value={c.id}>{c.consignmentNumber} — {c.commodity}</option>)}
              </select>
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnNeutral} onClick={() => setModal(null)}>Cancel</button>
              <button className={btnPrimary} disabled={!linkId || !!busy} onClick={async () => { await act("link", () => linkSlotConsignment(app.id, linkId), "Consignment linked"); setModal(null); }}>Link</button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
