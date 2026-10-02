import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import {
  createComplianceDoc, createSlotApplication, getCompliance, getCorridors, getSlotOverview, listSlotApplications,
  revokeComplianceDoc, verifyComplianceDoc, DOC_TYPES, DOC_TYPE_LABEL, ELECTRIFICATION_LABEL, GAUGE_LABEL, PROFILE_LABEL, SLOT_STATUS_LABEL,
  type ComplianceDoc, type ComplianceSummary, type Corridor, type RailComplianceDocType, type RailElectrification, type RailGauge,
  type RailVehicleProfile, type SlotApplication, type SlotOverview,
} from "../../api/railSlotApi";
import { listConsignments, type RailConsignment } from "../../api/railApi";
import {
  describeDaysLeft, docTone, envelopeLabel, envelopeTone, formatDate, rsrBlocksSubmission, rsrTone, slotStatusTone,
} from "../../lib/railSlot";
import { useToast } from "../../components/ToastProvider";
import EnvelopeChecker from "./EnvelopeChecker";
import SlotApplicationDrawer, { MobilisationBadge } from "./SlotApplicationDrawer";
import { Banner, Field, Modal, Pill, Section, btnDanger, btnNeutral, btnPrimary, inputCls } from "./railUi";

/** Which stages need each document, shown beside the document so the gate is never a surprise. */
const NEEDED_FOR: Record<RailComplianceDocType, string> = {
  RSR_PERMIT: "Submit + operate", INSURANCE: "Submit + operate", ROLLING_STOCK_CERT: "Submit + operate", TRAIN_CREW_CERT: "Submit + operate",
  DANGEROUS_GOODS: "Dangerous goods only", INTERFACE_AGREEMENT: "Operate", ACCESS_CONTRACT: "Operate", SECURITY_DEPOSIT: "Operate",
};

export default function SlotCompliancePanel({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<SlotOverview | null>(null);
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);
  const [apps, setApps] = useState<SlotApplication[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [consignments, setConsignments] = useState<RailConsignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [docModal, setDocModal] = useState<RailComplianceDocType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c, a, cor, cons] = await Promise.all([
        getSlotOverview(), getCompliance(), listSlotApplications(), getCorridors(), listConsignments().catch(() => [] as RailConsignment[]),
      ]);
      setOverview(o); setCompliance(c); setApps(a); setCorridors(cor); setConsignments(cons);
    } catch (e) {
      showToast(`Could not load slot applications: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const docsByType = useMemo(() => {
    const m = new Map<RailComplianceDocType, ComplianceDoc[]>();
    for (const d of compliance?.documents ?? []) m.set(d.docType, [...(m.get(d.docType) ?? []), d]);
    return m;
  }, [compliance]);

  const rsr = compliance?.rsrPermit ?? overview?.compliance.rsrPermit;
  const ref = overview?.reference;
  const corridorName = (code: string) => corridors.find((c) => c.code === code)?.name ?? code;

  async function docAction(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); showToast(ok, "success"); await load(); } catch (e) { showToast((e as Error)?.message || "Action failed", "error"); }
  }

  if (loading && !overview) {
    return <div className="flex items-center gap-2 py-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const att = overview?.applications.needingAttention.length ?? 0;
  return (
    <div data-testid="slot-compliance-panel">
      {rsr && (
        <Banner tone={rsrTone(rsr.level)} title={`RSR Safety Permit — ${rsr.level.replace("_", " ")}${rsr.validUntil ? ` · valid until ${formatDate(rsr.validUntil)} (${describeDaysLeft(rsr.daysRemaining)})` : ""}`}>
          {rsr.message}{rsrBlocksSubmission(rsr.level) ? " Submitting a slot application is blocked." : ""}
        </Banner>
      )}
      {ref && (ref.corridors.verified < ref.corridors.loaded || ref.yards.loaded < ref.yards.expected) && (
        <Banner tone="warn" title={`Reference data incomplete — ${ref.corridors.verified}/${ref.corridors.expected} corridors verified, ${ref.yards.loaded}/${ref.yards.expected} transfer yards loaded`}>
          {ref.message}
        </Banner>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Applications", overview?.applications.total ?? 0], ["Allocated", overview?.applications.byStatus.ALLOCATED ?? 0],
          ["Clocks needing attention", att], ["Awaiting assessment", (overview?.applications.byStatus.SUBMITTED ?? 0) + (overview?.applications.byStatus.UNDER_ASSESSMENT ?? 0)],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
            <div className={`mt-2 text-2xl font-black ${label === "Clocks needing attention" && att > 0 ? "text-amber-300" : "text-white"}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Compliance register ───────────────────────────────────────────── */}
      <Section title="Operator compliance documents" right={<button className={btnNeutral} onClick={() => void load()}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>}>
        <p className="mb-3 text-xs text-slate-400">An expired, revoked or unverified document is a <b>hard block</b>: slot applications cannot be submitted and first operation cannot be recorded until a valid one is on file.</p>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr><th className="px-3 py-2">Document</th><th className="px-3 py-2">Needed for</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Valid until</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {DOC_TYPES.map((type) => {
                const docs = [...(docsByType.get(type) ?? [])].sort((a, b) => b.validUntil.localeCompare(a.validUntil));
                const best = docs.find((d) => d.effectiveStatus === "VALID") ?? docs[0];
                return (
                  <tr key={type}>
                    <td className="px-3 py-2.5 font-semibold text-white">{DOC_TYPE_LABEL[type]}{best?.referenceNumber ? <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">{best.referenceNumber}</span> : null}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{NEEDED_FOR[type]}</td>
                    <td className="px-3 py-2.5">{best ? <Pill tone={docTone(best.effectiveStatus)}>{best.effectiveStatus.replace("_", " ")}</Pill> : <Pill tone="danger">NOT ON FILE</Pill>}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300">{best ? <>{formatDate(best.validUntil)} <span className="text-slate-500">· {describeDaysLeft(best.daysRemaining)}</span></> : "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {canSign && best?.status === "PENDING_REVIEW" && best.effectiveStatus === "PENDING_REVIEW" && (
                          <button className={btnPrimary} onClick={() => docAction(() => verifyComplianceDoc(best.id), "Document verified")}>Verify</button>
                        )}
                        {canSign && best && best.status !== "REVOKED" && (
                          <button className={btnDanger} onClick={() => { const r = window.prompt("Reason for revoking this document:"); if (r && r.trim().length >= 3) void docAction(() => revokeComplianceDoc(best.id, r.trim()), "Document revoked"); }}>Revoke</button>
                        )}
                        {canWrite && <button className={btnNeutral} onClick={() => setDocModal(type)}>{best ? "Add renewal" : "Add"}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Applications ──────────────────────────────────────────────────── */}
      <Section title="Slot applications" right={canWrite ? <button className={btnPrimary} onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5" /> New application</button> : undefined}>
        {apps.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No slot applications yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr><th className="px-3 py-2">Application</th><th className="px-3 py-2">Corridor</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Requested window</th><th className="px-3 py-2">Mobilisation (60 days)</th><th className="px-3 py-2">Envelope</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {apps.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setOpenId(a.id)}>
                    <td className="px-3 py-2.5 font-mono font-semibold text-emerald-400">{a.applicationNumber}</td>
                    <td className="px-3 py-2.5 text-slate-300">{corridorName(a.corridorCode)}</td>
                    <td className="px-3 py-2.5"><Pill tone={slotStatusTone(a.status)}>{SLOT_STATUS_LABEL[a.status]}</Pill></td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{formatDate(a.requestedFrom)} → {formatDate(a.requestedUntil)}</td>
                    <td className="px-3 py-2.5"><MobilisationBadge app={a} /></td>
                    <td className="px-3 py-2.5">{a.envelopeCheckStatus ? <Pill tone={envelopeTone(a.envelopeCheckStatus)}>{envelopeLabel(a.envelopeCheckStatus).split(" — ")[0]}</Pill> : <span className="text-xs text-slate-500">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <EnvelopeChecker corridors={corridors} consignments={consignments} />

      {openId && (
        <SlotApplicationDrawer id={openId} canWrite={canWrite} canSign={canSign} corridors={corridors} consignments={consignments}
          onClose={() => setOpenId(null)} onChanged={() => void load()} />
      )}
      {showNew && <NewApplicationModal corridors={corridors} onClose={() => setShowNew(false)} onCreated={(a) => { setShowNew(false); void load(); setOpenId(a.id); }} />}
      {docModal && <AddDocModal initialType={docModal} onClose={() => setDocModal(null)} onSaved={() => { setDocModal(null); void load(); }} />}
    </div>
  );
}

// ── New application ───────────────────────────────────────────────────────────
function NewApplicationModal({ corridors, onClose, onCreated }: { corridors: Corridor[]; onClose: () => void; onCreated: (a: SlotApplication) => void }) {
  const { showToast } = useToast();
  const [f, setF] = useState({
    corridorCode: "", originName: "", destinationName: "", commodity: "", tractionType: "" as RailElectrification | "", isDangerousGoods: false,
    trainsPerWeek: "", wagonsPerTrain: "", annualTonnes: "", gauge: "" as RailGauge | "", axleLoadTonnes: "", vehicleProfile: "" as RailVehicleProfile | "",
    trainLengthM: "", requestedFrom: "", requestedUntil: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const ok = f.corridorCode && f.requestedFrom && f.requestedUntil;

  async function save() {
    setBusy(true);
    try {
      const a = await createSlotApplication({
        corridorCode: f.corridorCode, requestedFrom: new Date(f.requestedFrom).toISOString(), requestedUntil: new Date(f.requestedUntil).toISOString(),
        originName: f.originName || undefined, destinationName: f.destinationName || undefined, commodity: f.commodity || undefined,
        tractionType: f.tractionType || undefined, isDangerousGoods: f.isDangerousGoods, trainsPerWeek: num(f.trainsPerWeek), wagonsPerTrain: num(f.wagonsPerTrain),
        annualTonnes: num(f.annualTonnes), gauge: f.gauge || undefined, axleLoadTonnes: num(f.axleLoadTonnes), vehicleProfile: f.vehicleProfile || undefined,
        trainLengthM: num(f.trainLengthM),
      });
      showToast(`Draft ${a.applicationNumber} created`, "success");
      onCreated(a);
    } catch (e) {
      showToast((e as Error)?.message || "Could not create the application", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New slot application" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Corridor *">
          <select className={inputCls} value={f.corridorCode} onChange={(e) => set("corridorCode", e.target.value)} aria-label="Corridor">
            <option value="">Select a corridor</option>
            {corridors.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Commodity"><input className={inputCls} value={f.commodity} onChange={(e) => set("commodity", e.target.value)} aria-label="Commodity" /></Field>
        <Field label="Origin"><input className={inputCls} value={f.originName} onChange={(e) => set("originName", e.target.value)} aria-label="Origin" /></Field>
        <Field label="Destination"><input className={inputCls} value={f.destinationName} onChange={(e) => set("destinationName", e.target.value)} aria-label="Destination" /></Field>
        <Field label="Window from *"><input type="date" className={inputCls} value={f.requestedFrom} onChange={(e) => set("requestedFrom", e.target.value)} aria-label="Window from" /></Field>
        <Field label="Window until * (at most 5 years)"><input type="date" className={inputCls} value={f.requestedUntil} onChange={(e) => set("requestedUntil", e.target.value)} aria-label="Window until" /></Field>
        <Field label="Traction">
          <select className={inputCls} value={f.tractionType} onChange={(e) => set("tractionType", e.target.value as RailElectrification | "")}>
            <option value="">Not stated</option>{(Object.keys(ELECTRIFICATION_LABEL) as RailElectrification[]).map((k) => <option key={k} value={k}>{ELECTRIFICATION_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Trains per week"><input type="number" min="1" className={inputCls} value={f.trainsPerWeek} onChange={(e) => set("trainsPerWeek", e.target.value)} /></Field>
        <Field label="Gauge">
          <select className={inputCls} value={f.gauge} onChange={(e) => set("gauge", e.target.value as RailGauge | "")} aria-label="Gauge">
            <option value="">Not declared</option>{(Object.keys(GAUGE_LABEL) as RailGauge[]).map((k) => <option key={k} value={k}>{GAUGE_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Axle load (t)"><input type="number" min="0" step="0.1" className={inputCls} value={f.axleLoadTonnes} onChange={(e) => set("axleLoadTonnes", e.target.value)} aria-label="Axle load" /></Field>
        <Field label="Vehicle profile">
          <select className={inputCls} value={f.vehicleProfile} onChange={(e) => set("vehicleProfile", e.target.value as RailVehicleProfile | "")}>
            <option value="">Not declared</option>{(Object.keys(PROFILE_LABEL) as RailVehicleProfile[]).map((k) => <option key={k} value={k}>{PROFILE_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Train length (m)"><input type="number" min="1" className={inputCls} value={f.trainLengthM} onChange={(e) => set("trainLengthM", e.target.value)} /></Field>
        <Field label="Wagons per train"><input type="number" min="1" className={inputCls} value={f.wagonsPerTrain} onChange={(e) => set("wagonsPerTrain", e.target.value)} /></Field>
        <Field label="Annual tonnes"><input type="number" min="0" className={inputCls} value={f.annualTonnes} onChange={(e) => set("annualTonnes", e.target.value)} /></Field>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={f.isDangerousGoods} onChange={(e) => set("isDangerousGoods", e.target.checked)} /> Carries dangerous goods (needs a valid DG authorisation to submit)
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnNeutral} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} disabled={!ok || busy} onClick={save}>{busy ? "Creating…" : "Create draft"}</button>
      </div>
    </Modal>
  );
}

// ── Add compliance document ───────────────────────────────────────────────────
function AddDocModal({ initialType, onClose, onSaved }: { initialType: RailComplianceDocType; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [f, setF] = useState({ docType: initialType, referenceNumber: "", issuer: "", validFrom: "", validUntil: "", documentUrl: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    setBusy(true);
    try {
      await createComplianceDoc({
        docType: f.docType, referenceNumber: f.referenceNumber || undefined, issuer: f.issuer || undefined,
        validFrom: new Date(f.validFrom).toISOString(), validUntil: new Date(f.validUntil).toISOString(),
        documentUrl: f.documentUrl || undefined, notes: f.notes || undefined,
      });
      showToast("Document recorded — it starts as PENDING REVIEW until an authorised representative verifies it", "success");
      onSaved();
    } catch (e) {
      showToast((e as Error)?.message || "Could not save the document", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Record a compliance document" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Document type">
          <select className={inputCls} value={f.docType} onChange={(e) => set("docType", e.target.value as RailComplianceDocType)} aria-label="Document type">
            {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reference number"><input className={inputCls} value={f.referenceNumber} onChange={(e) => set("referenceNumber", e.target.value)} aria-label="Reference number" /></Field>
          <Field label="Issuer"><input className={inputCls} value={f.issuer} onChange={(e) => set("issuer", e.target.value)} aria-label="Issuer" /></Field>
          <Field label="Valid from *"><input type="date" className={inputCls} value={f.validFrom} onChange={(e) => set("validFrom", e.target.value)} aria-label="Valid from" /></Field>
          <Field label="Valid until *"><input type="date" className={inputCls} value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} aria-label="Valid until" /></Field>
        </div>
        <Field label="Link to the controlled copy (https://…)"><input className={inputCls} value={f.documentUrl} onChange={(e) => set("documentUrl", e.target.value)} placeholder="optional — never upload the file here" aria-label="Document link" /></Field>
        <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnNeutral} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} disabled={!f.validFrom || !f.validUntil || busy} onClick={save}>{busy ? "Saving…" : "Save document"}</button>
      </div>
    </Modal>
  );
}
