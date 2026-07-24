import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, Plus, Trash2, Sparkles, Wand2, FileText, Truck, AlertTriangle,
  Box, Package, DollarSign, Anchor, ChevronRight, CheckCircle2, Download, Calculator,
  Stamp, Send, Timer, Layers,
} from "lucide-react";
import * as fwd from "../../api/forwardingApi";
import { useToast } from "../../components/ToastProvider";
import BackButton from "../../components/BackButton";

const STATUS_FLOW: fwd.ShipmentStatus[] = [
  "DRAFT", "BOOKED", "CARGO_RECEIVED", "LOADED", "DEPARTED", "ARRIVED", "CUSTOMS_CLEARED", "DELIVERED",
];

export default function ShipmentFilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [file, setFile] = useState<fwd.ShipmentFile | null>(null);
  const [totals, setTotals] = useState<fwd.Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([fwd.getFile(id), fwd.getTotals(id).catch(() => null)]);
      setFile(f); setTotals(t);
    } catch (e: any) {
      showToast(e?.message ?? "Could not load file", "error");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) showToast(ok, "success"); await load(); }
    catch (e: any) { showToast(e?.message ?? "Action failed", "error"); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="min-h-full grid place-items-center bg-[#0b1530]"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>;
  if (!file) return <div className="min-h-full grid place-items-center bg-[#0b1530] text-white/50">File not found</div>;

  const nextStatus = STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(file.status) + 1, STATUS_FLOW.length - 1)];
  const canAdvance = file.status !== "DELIVERED" && file.status !== "CANCELLED";
  const risk = file.aiRiskScore ?? 0;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <BackButton to="/forwarding" />
          <h1 className="text-2xl font-black text-white flex items-center gap-2"><Anchor className="h-5 w-5 text-cyan-300" />{file.fileNumber}</h1>
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/60">{file.direction} · {file.mode} · {file.loadType}</span>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-300 uppercase">{file.status.replace(/_/g, " ")}</span>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          {canAdvance && (
            <button onClick={() => run("ms", () => fwd.advanceMilestone(id, nextStatus), `Advanced to ${nextStatus}`)} disabled={!!busy}
              className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 py-2 text-sm font-bold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50">
              <ChevronRight className="h-4 w-4" /> Advance → {nextStatus.replace(/_/g, " ")}
            </button>
          )}
          <button onClick={() => run("risk", () => fwd.assessRisk(id), "Risk recalculated")} disabled={!!busy}
            className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/15 px-3 py-2 text-sm font-bold text-violet-200 hover:bg-violet-500/25 disabled:opacity-50">
            {busy === "risk" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI risk
          </button>
          <button onClick={() => run("inv", () => fwd.generateInvoice(id), "Draft invoice created")} disabled={!!busy}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50">
            <FileText className="h-4 w-4" /> Generate invoice
          </button>
          {(file.status === "CUSTOMS_CLEARED" || file.status === "ARRIVED") && (
            <button onClick={() => run("deliv", async () => { const r: any = await fwd.createDelivery(id); showToast("Domestic delivery created", "success"); if (r?.collectionId) navigate(`/collections?collectionId=${r.collectionId}`); }, undefined)} disabled={!!busy}
              className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">
              <Truck className="h-4 w-4" /> Create domestic delivery
            </button>
          )}
        </div>

        {/* AI risk note */}
        {(file.aiRiskNote || risk > 0) && (
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${risk >= 50 ? "border-rose-500/30 bg-rose-500/8" : "border-white/10 bg-white/5"}`}>
            <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${risk >= 50 ? "text-rose-300" : "text-white/40"}`} />
            <div>
              <p className="text-sm font-bold text-white/85">Demurrage / delay risk: {risk}/100</p>
              {file.aiRiskNote && <p className="text-xs text-white/55 mt-0.5">{file.aiRiskNote}</p>}
            </div>
          </div>
        )}

        {/* Parties + routing */}
        <Section title="Parties & routing" icon={Anchor}>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Field label="Shipper" value={file.shipperName} />
            <Field label="Consignee" value={file.consigneeName} />
            <Field label="Carrier" value={file.carrierName} />
            <Field label="Incoterm" value={file.incoterm} />
            <Field label="POL → POD" value={`${file.pol || "?"} → ${file.pod || "?"}`} />
            <Field label="Vessel/Voyage" value={file.vesselVoyage} />
            <Field label="ETD" value={file.etd ? new Date(file.etd).toLocaleDateString("en-ZA") : null} />
            <Field label="ETA" value={file.eta ? new Date(file.eta).toLocaleDateString("en-ZA") : null} />
          </div>
        </Section>

        {/* Containers */}
        <Section title={`Containers (${file.containers?.length ?? 0})`} icon={Box}>
          {file.containers?.map((c) => (
            <Row key={c.id} onDelete={() => run("c" + c.id, () => fwd.removeContainer(id, c.id))} busy={busy === "c" + c.id}>
              <span className="font-mono font-bold text-white/85">{c.containerNo}</span>
              <span className="text-white/40">{c.isoType}</span>
              {c.sealNo && <span className="text-white/30">seal {c.sealNo}</span>}
              {c.vgmKg != null && <span className="text-white/30">{c.vgmKg}kg</span>}
            </Row>
          ))}
          <AddContainer onAdd={(dto) => run("addc", async () => {
            const r: any = await fwd.addContainer(id, dto);
            if (r && r.wellFormed && r.checkDigitValid === false) showToast("Added — but the container check-digit looks invalid", "error");
          }, "Container added")} disabled={!!busy} />
        </Section>

        {/* Cargo */}
        <Section title={`Cargo (${file.cargo?.length ?? 0})`} icon={Package}>
          {file.cargo?.map((c) => (
            <Row key={c.id} onDelete={() => run("g" + c.id, () => fwd.removeCargo(id, c.id))} busy={busy === "g" + c.id}>
              <span className="text-white/85">{c.description}</span>
              {c.hsCode && <span className="rounded bg-sky-500/10 px-1.5 text-[11px] text-sky-300">HS {c.hsCode}</span>}
              {c.customsValue != null && <span className="text-white/30">val {c.customsValue}</span>}
            </Row>
          ))}
          <AddCargo fileId={id} onAdd={(dto) => run("addg", () => fwd.addCargo(id, dto), "Cargo added")} disabled={!!busy} />
        </Section>

        {/* Charges + margin */}
        <Section title="Charges & margin" icon={DollarSign}>
          {file.charges?.map((c) => (
            <Row key={c.id} onDelete={() => run("h" + c.id, () => fwd.removeCharge(id, c.id))} busy={busy === "h" + c.id}>
              <span className="text-white/85">{c.description}</span>
              <span className="ml-auto text-white/40">{c.currency} {c.cost.toFixed(2)} → {c.sell.toFixed(2)}</span>
            </Row>
          ))}
          <AddCharge onAdd={(dto) => run("addh", () => fwd.addCharge(id, dto), "Charge added")} disabled={!!busy} />
          {totals && totals.currencies.length > 0 && (
            <div className="mt-3 space-y-1">
              {totals.currencies.map((t) => (
                <div key={t.currency} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm">
                  <span className="font-bold text-white/70">{t.currency}</span>
                  <span className="text-white/50">cost {t.cost.toFixed(2)} · sell {t.sell.toFixed(2)}</span>
                  <span className={`font-black ${t.margin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>margin {t.margin.toFixed(2)} ({t.marginPct}%)</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Documents & SA customs (Phase 2) */}
        <CustomsDocs fileId={id} cargo={file.cargo || []} onChange={load} />

        {/* SAD declaration + demurrage (Phase 3) */}
        <DeclarationPanel fileId={id} />
        <DemurragePanel fileId={id} containers={file.containers || []} />
        <ConsolidationPanel file={file} onChange={load} />

        {/* Milestone timeline */}
        <Section title="Milestones" icon={CheckCircle2}>
          {file.milestones && file.milestones.length > 0 ? (
            <div className="space-y-1.5">
              {file.milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="font-bold text-white/75">{m.status.replace(/_/g, " ")}</span>
                  {m.note && <span className="text-white/40">— {m.note}</span>}
                  <span className="ml-auto text-[11px] text-white/25">{new Date(m.reachedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-white/30">No milestones yet — use "Advance" above.</p>}
        </Section>
      </div>
    </div>
  );
}

// ── Small building blocks ──────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 fx-lift fx-reveal">
      <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white/55 mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-cyan-300" />{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Field({ label, value }: { label: string; value?: string | null }) {
  return <div><span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span><div className="text-white/80">{value || "—"}</div></div>;
}
function Row({ children, onDelete, busy }: { children: React.ReactNode; onDelete: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-sm flex-wrap">
      {children}
      <button onClick={onDelete} disabled={busy} className="ml-auto text-white/25 hover:text-rose-300 disabled:opacity-40">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
const inputCls = "rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder-white/25";

function AddContainer({ onAdd, disabled }: { onAdd: (d: any) => void; disabled: boolean }) {
  const [containerNo, setNo] = useState(""); const [isoType, setIso] = useState("40HC");
  return (
    <div className="flex gap-2 flex-wrap pt-1">
      <input placeholder="ABCU1234567" value={containerNo} onChange={(e) => setNo(e.target.value)} className={`${inputCls} font-mono w-40`} />
      <input placeholder="ISO (40HC)" value={isoType} onChange={(e) => setIso(e.target.value)} className={`${inputCls} w-24`} />
      <button onClick={() => { if (containerNo) { onAdd({ containerNo, isoType }); setNo(""); } }} disabled={disabled || !containerNo}
        className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button>
    </div>
  );
}

function AddCargo({ fileId, onAdd, disabled }: { fileId: string; onAdd: (d: any) => void; disabled: boolean }) {
  const { showToast } = useToast();
  const [description, setDesc] = useState(""); const [hsCode, setHs] = useState(""); const [classifying, setClassifying] = useState(false);
  const classify = async () => {
    if (!description) return;
    setClassifying(true);
    try {
      const r = await fwd.hsClassify(fileId, description);
      if (r.available && r.suggestions[0]) { setHs(r.suggestions[0].hsCode); showToast(`CLAW suggests HS ${r.suggestions[0].hsCode}`, "success"); }
      else showToast("AI HS classification unavailable (set GROQ_API_KEY)", "error");
    } catch { showToast("Classification failed", "error"); } finally { setClassifying(false); }
  };
  return (
    <div className="flex gap-2 flex-wrap pt-1">
      <input placeholder="Goods description" value={description} onChange={(e) => setDesc(e.target.value)} className={`${inputCls} flex-1 min-w-[160px]`} />
      <input placeholder="HS code" value={hsCode} onChange={(e) => setHs(e.target.value)} className={`${inputCls} w-28`} />
      <button onClick={classify} disabled={classifying || !description} title="AI classify HS code"
        className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/15 px-2.5 py-1.5 text-xs font-bold text-violet-200 disabled:opacity-40">
        {classifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => { if (description) { onAdd({ description, hsCode: hsCode || undefined }); setDesc(""); setHs(""); } }} disabled={disabled || !description}
        className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button>
    </div>
  );
}

function AddCharge({ onAdd, disabled }: { onAdd: (d: any) => void; disabled: boolean }) {
  const [description, setDesc] = useState(""); const [cost, setCost] = useState(""); const [sell, setSell] = useState(""); const [currency, setCur] = useState("ZAR");
  return (
    <div className="flex gap-2 flex-wrap pt-1">
      <input placeholder="Charge" value={description} onChange={(e) => setDesc(e.target.value)} className={`${inputCls} flex-1 min-w-[140px]`} />
      <input placeholder="ZAR" value={currency} onChange={(e) => setCur(e.target.value)} className={`${inputCls} w-16`} />
      <input placeholder="cost" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} w-20`} />
      <input placeholder="sell" value={sell} onChange={(e) => setSell(e.target.value)} className={`${inputCls} w-20`} />
      <button onClick={() => { if (description) { onAdd({ description, currency, cost: Number(cost) || 0, sell: Number(sell) || 0 }); setDesc(""); setCost(""); setSell(""); } }} disabled={disabled || !description}
        className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button>
    </div>
  );
}

const DOC_TYPES: { type: fwd.ForwardingDocType; label: string }[] = [
  { type: "commercial-invoice", label: "Commercial Invoice" },
  { type: "packing-list", label: "Packing List" },
  { type: "bill-of-lading", label: "Bill of Lading" },
  { type: "sad500", label: "SAD 500 (draft)" },
  { type: "cmr", label: "CMR Consignment Note" },
  { type: "certificate-of-origin", label: "Certificate of Origin" },
  { type: "dangerous-goods", label: "Dangerous Goods Declaration" },
  { type: "transit-bond", label: "Transit Bond" },
  { type: "zim-form47", label: "ZIMRA Form 47 (Import)" },
];

function CustomsDocs({ fileId, cargo, onChange }: { fileId: string; cargo: fwd.Cargo[]; onChange: () => void }) {
  const { showToast } = useToast();
  const [est, setEst] = useState<fwd.CustomsEstimate | null>(null);
  const [edits, setEdits] = useState<Record<string, { customsValue?: string; dutyRatePct?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const loadEst = async () => { try { setEst(await fwd.getCustomsEstimate(fileId)); } catch { /* none yet */ } };
  useEffect(() => { void loadEst(); /* eslint-disable-next-line */ }, [fileId]);

  const dl = async (type: fwd.ForwardingDocType) => {
    setBusy(type);
    try { await fwd.downloadDoc(fileId, type); }
    catch { showToast("Could not generate document", "error"); }
    finally { setBusy(null); }
  };

  const saveLine = async (c: fwd.Cargo) => {
    const e = edits[c.id] || {};
    setBusy(c.id);
    try {
      await fwd.updateCargo(fileId, c.id, {
        customsValue: e.customsValue !== undefined ? Number(e.customsValue) : undefined,
        dutyRatePct: e.dutyRatePct !== undefined ? Number(e.dutyRatePct) : undefined,
      });
      await loadEst(); onChange();
      showToast("Customs line updated", "success");
    } catch (err: any) { showToast(err?.message ?? "Update failed", "error"); }
    finally { setBusy(null); }
  };

  const suggest = async (c: fwd.Cargo) => {
    setBusy("ai" + c.id);
    try {
      const r = await fwd.suggestDuty(fileId, c.hsCode ?? undefined, c.description);
      if (r.available && r.dutyRatePct != null) {
        setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], dutyRatePct: String(r.dutyRatePct) } }));
        showToast(`CLAW suggests ~${r.dutyRatePct}% duty`, "success");
      } else showToast("AI duty suggestion unavailable (set GROQ_API_KEY)", "error");
    } catch { showToast("Suggestion failed", "error"); }
    finally { setBusy(null); }
  };

  return (
    <Section title="Documents & SA customs" icon={Calculator}>
      {/* Document downloads */}
      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((d) => (
          <button key={d.type} onClick={() => dl(d.type)} disabled={busy === d.type}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white transition disabled:opacity-40">
            {busy === d.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {d.label}
          </button>
        ))}
      </div>

      {/* SA customs estimate */}
      <div className="mt-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">Duty &amp; VAT estimate (ZAR)</p>
        {cargo.length === 0 ? (
          <p className="text-xs text-white/30">Add cargo lines (with customs value) to estimate duty &amp; VAT.</p>
        ) : (
          <div className="space-y-1.5">
            {cargo.map((c) => {
              const e = edits[c.id] || {};
              const line = est?.lines.find((l) => l.cargoId === c.id);
              return (
                <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/6 bg-black/20 px-3 py-2 flex-wrap text-sm">
                  <span className="text-white/75 flex-1 min-w-[120px] truncate">{c.description}{c.hsCode ? ` · HS ${c.hsCode}` : ""}</span>
                  <input className={`${inputCls} w-24`} placeholder="value"
                    value={e.customsValue ?? (c.customsValue ?? "")}
                    onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], customsValue: ev.target.value } }))} />
                  <input className={`${inputCls} w-16`} placeholder="duty%"
                    value={e.dutyRatePct ?? (c.dutyRatePct ?? "")}
                    onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], dutyRatePct: ev.target.value } }))} />
                  <button onClick={() => suggest(c)} disabled={busy === "ai" + c.id} title="AI duty rate"
                    className="rounded-lg border border-violet-500/30 bg-violet-500/15 px-2 py-1.5 text-violet-200 disabled:opacity-40">
                    {busy === "ai" + c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => saveLine(c)} disabled={busy === c.id}
                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-40">save</button>
                  {line && <span className="text-[11px] text-white/40 w-full sm:w-auto">duty {line.duty.toFixed(0)} · VAT {line.vat.toFixed(0)}</span>}
                </div>
              );
            })}
          </div>
        )}
        {est && est.totals.customsValue > 0 && (
          <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-sm flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-white/60">Customs value <b className="text-white/85">{est.totals.customsValue.toFixed(2)}</b></span>
            <span className="text-white/60">Duty <b className="text-white/85">{est.totals.duty.toFixed(2)}</b></span>
            <span className="text-white/60">VAT (15% on ATV) <b className="text-white/85">{est.totals.vat.toFixed(2)}</b></span>
            <span className="ml-auto text-emerald-300 font-black">Payable to SARS (est.) {est.totals.totalPayable.toFixed(2)}</span>
          </div>
        )}
        {est && <p className="mt-1 text-[10px] text-white/25">{est.note}</p>}
      </div>
    </Section>
  );
}

const DECL_STATUS_CLS: Record<string, string> = {
  DRAFT: "border-white/15 bg-white/5 text-white/50",
  SUBMITTED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  QUERY: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  RELEASED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function DeclarationPanel({ fileId }: { fileId: string }) {
  const { showToast } = useToast();
  const [decl, setDecl] = useState<fwd.CustomsDeclaration | null>(null);
  const [msgs, setMsgs] = useState<fwd.CustomsEdiMessage[]>([]);
  const [mrn, setMrn] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadMsgs = async (did: string) => { try { setMsgs(await fwd.getDeclarationMessages(did)); } catch { /* none */ } };
  const load = async () => {
    try {
      const d = await fwd.getDeclaration(fileId);
      setDecl(d);
      if (d) await loadMsgs(d.id);
    } catch { /* none */ }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [fileId]);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const r = await fn();
      setDecl(r);
      if (r?.id) await loadMsgs(r.id);
      showToast(ok, "success");
    }
    catch (e: any) { showToast(e?.message ?? "Action failed", "error"); }
    finally { setBusy(null); }
  };

  return (
    <Section title="Customs declaration (SAD)" icon={Stamp}>
      {!decl ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-white/40">Build a SAD declaration (CUSDEC payload) from this file's cargo, HS codes and customs estimate.</p>
          <button onClick={() => act("build", () => fwd.buildDeclaration(fileId), "Declaration built")} disabled={busy === "build"}
            className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-3 py-2 text-sm font-bold text-cyan-200 disabled:opacity-40">
            {busy === "build" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />} Build declaration
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-white/85">{decl.lrn}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${DECL_STATUS_CLS[decl.status]}`}>{decl.status}</span>
            {decl.mrn && <span className="text-[11px] text-white/40">MRN {decl.mrn}</span>}
            <span className="ml-auto text-[11px] text-white/50">duty {(decl.dutyTotal ?? 0).toFixed(0)} · VAT {(decl.vatTotal ?? 0).toFixed(0)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => act("build", () => fwd.buildDeclaration(fileId), "Refreshed from file")} disabled={!!busy}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-white/60 hover:bg-white/10 disabled:opacity-40">Refresh from file</button>
            {(decl.status === "DRAFT" || decl.status === "REJECTED") && (
              <button onClick={() => act("submit", () => fwd.submitDeclaration(decl.id), "Submitted via configured path")} disabled={!!busy}
                className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/15 px-2.5 py-1.5 text-xs font-bold text-sky-200 disabled:opacity-40">
                {busy === "submit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit
              </button>
            )}
          </div>

          {/* Honest lodgement state */}
          {decl.responseNote && <p className="text-[11px] text-amber-300/70">{decl.responseNote}</p>}
          {decl.lodgementProvider && (
            <p className="text-[10px] text-white/35">Routed via <span className="text-white/55">{decl.lodgementProvider.replace(/_/g, " ").toLowerCase()}</span></p>
          )}

          {/* Record SARS / agent response (closes the loop) */}
          {decl.status !== "RELEASED" && (
            <div className="rounded-xl border border-white/8 bg-black/20 p-2.5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Record SARS response</p>
              <div className="flex flex-wrap items-center gap-2">
                <input placeholder="MRN (from SARS / agent)" value={mrn} onChange={(e) => setMrn(e.target.value)} className={`${inputCls} w-48`} />
                <button onClick={() => act("rel", () => fwd.setDeclarationStatus(decl.id, "RELEASED", mrn || undefined), "Marked released")} disabled={!!busy}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-40">Released</button>
                <button onClick={() => act("qry", () => fwd.setDeclarationStatus(decl.id, "QUERY", mrn || undefined), "Marked query")} disabled={!!busy}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-40">Query</button>
                <button onClick={() => act("rej", () => fwd.setDeclarationStatus(decl.id, "REJECTED", mrn || undefined), "Marked rejected")} disabled={!!busy}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1.5 text-xs font-bold text-rose-200 disabled:opacity-40">Rejected</button>
              </div>
            </div>
          )}

          {/* CUSDEC / CUSRES message timeline */}
          {msgs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Transmission log</p>
              {msgs.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-[11px] text-white/55">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${m.direction === "OUTBOUND" ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300"}`}>{m.direction === "OUTBOUND" ? "→" : "←"} {m.messageType}</span>
                  <span className={m.status === "ERROR" ? "text-rose-300" : "text-white/55"}>{m.status}</span>
                  {m.reference && <span className="text-white/35">· {m.reference}</span>}
                  {m.error && <span className="text-rose-300/70 truncate">· {m.error}</span>}
                  <span className="ml-auto text-white/25">{new Date(m.createdAt).toLocaleString("en-ZA")}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-white/25">Transmission path is configured per company under Freight Forwarding ▸ SARS EDI. Nothing is marked “lodged with SARS” without a real acknowledgement.</p>
        </div>
      )}
    </Section>
  );
}

function DemurragePanel({ fileId, containers }: { fileId: string; containers: fwd.Container[] }) {
  const { showToast } = useToast();
  const [dem, setDem] = useState<fwd.Demurrage | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => { try { setDem(await fwd.getDemurrage(fileId)); } catch { /* none */ } };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [fileId]);

  if (containers.length === 0) return null;

  const save = async (cid: string) => {
    const e = edits[cid] || {};
    setBusy(cid);
    try {
      await fwd.setDemurrage(fileId, cid, {
        freeDays: e.freeDays !== undefined ? Number(e.freeDays) : undefined,
        perDiemRate: e.perDiemRate !== undefined ? Number(e.perDiemRate) : undefined,
        availableFrom: e.availableFrom !== undefined ? (e.availableFrom || null) : undefined,
        returnedAt: e.returnedAt !== undefined ? (e.returnedAt || null) : undefined,
      });
      await load();
      showToast("Demurrage terms saved", "success");
    } catch (err: any) { showToast(err?.message ?? "Save failed", "error"); }
    finally { setBusy(null); }
  };

  const lineFor = (cid: string) => dem?.lines.find((l) => l.containerId === cid);

  return (
    <Section title="Demurrage & detention" icon={Timer}>
      {dem && (
        <div className={`rounded-xl border px-3 py-2 text-sm flex items-center gap-3 flex-wrap ${
          dem.riskLevel === "high" ? "border-rose-500/30 bg-rose-500/8" : dem.riskLevel === "medium" ? "border-amber-500/30 bg-amber-500/8" : "border-white/8 bg-black/20"}`}>
          {dem.accruing && <AlertTriangle className="h-4 w-4 text-rose-300" />}
          <span className="text-white/70">Accruing charges: <b className={dem.totalCharge > 0 ? "text-rose-300" : "text-white/85"}>{dem.totalCharge.toFixed(2)}</b></span>
          {dem.nearLimit && <span className="text-amber-300 text-xs">free days nearly used</span>}
        </div>
      )}
      <div className="space-y-1.5">
        {containers.map((c) => {
          const e = edits[c.id] || {};
          const ln = lineFor(c.id);
          return (
            <div key={c.id} className="rounded-xl border border-white/6 bg-black/20 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-white/85 text-sm">{c.containerNo}</span>
                {ln && ln.charge > 0 && <span className="text-[11px] text-rose-300">{ln.chargeableDays}d × rate = {ln.charge.toFixed(2)}</span>}
                {ln && ln.charge === 0 && ln.open && (ln.daysToFree ?? 0) >= 0 && <span className="text-[11px] text-white/40">{ln.daysToFree}d free left</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <input type="number" placeholder="free days" defaultValue={c.freeDays ?? ""} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], freeDays: ev.target.value } }))} className={`${inputCls} w-24`} />
                <input type="number" placeholder="per-diem" defaultValue={c.perDiemRate ?? ""} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], perDiemRate: ev.target.value } }))} className={`${inputCls} w-24`} />
                <input type="date" title="available from" defaultValue={c.availableFrom ? c.availableFrom.slice(0, 10) : ""} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], availableFrom: ev.target.value } }))} className={`${inputCls} w-36`} />
                <input type="date" title="returned at" defaultValue={c.returnedAt ? c.returnedAt.slice(0, 10) : ""} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], returnedAt: ev.target.value } }))} className={`${inputCls} w-36`} />
                <button onClick={() => save(c.id)} disabled={busy === c.id}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-40">{busy === c.id ? "…" : "save"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ConsolidationPanel({ file, onChange }: { file: fwd.ShipmentFile; onChange: () => void }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [view, setView] = useState<fwd.ConsolidationView | null>(null);
  const [candidates, setCandidates] = useState<fwd.AttachableHouse[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isMaster = !!file.isMaster;
  const isHouse = !!file.masterFileId;

  const load = async () => {
    if (!isMaster) return;
    try {
      const [v, c] = await Promise.all([fwd.getConsolidation(file.id), fwd.attachableHouses(file.id)]);
      setView(v); setCandidates(c);
    } catch { /* none */ }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [file.id, file.isMaster]);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try { await fn(); showToast(ok, "success"); await load(); onChange(); }
    catch (e: any) { showToast(e?.message ?? "Action failed", "error"); }
    finally { setBusy(null); }
  };

  // House file → show its master link.
  if (isHouse) {
    return (
      <Section title="Consolidation" icon={Layers}>
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-300">HOUSE FILE</span>
          <span className="text-white/55">Consolidated under a master file.</span>
          <button onClick={() => navigate(`/forwarding/${file.masterFileId}`)} className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10">
            Open master <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </Section>
    );
  }

  // Neither master nor house → offer to promote.
  if (!isMaster) {
    return (
      <Section title="Consolidation" icon={Layers}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-white/40">Group multiple house files under this one (LCL groupage / air co-load).</p>
          <button onClick={() => act("mk", () => fwd.markMaster(file.id), "Now a consolidation master")} disabled={busy === "mk"}
            className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 py-2 text-sm font-bold text-indigo-200 disabled:opacity-40">
            {busy === "mk" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />} Make consolidation master
          </button>
        </div>
      </Section>
    );
  }

  // Master view.
  return (
    <Section title="Consolidation (master)" icon={Layers}>
      {view && (
        <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/8 px-3 py-2 text-sm flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-white/60">Houses <b className="text-white/85">{view.summary.houseCount}</b></span>
          <span className="text-white/60">Packages <b className="text-white/85">{view.summary.packages}</b></span>
          <span className="text-white/60">Weight <b className="text-white/85">{view.summary.grossWeightKg} kg</b></span>
          <span className="text-white/60">Volume <b className="text-white/85">{view.summary.volumeCbm} CBM</b></span>
        </div>
      )}

      <div className="space-y-1.5">
        {(view?.houses ?? []).map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-sm">
            <button onClick={() => navigate(`/forwarding/${h.id}`)} className="font-mono font-bold text-white/85 hover:text-cyan-300">{h.fileNumber}</button>
            <span className="text-white/40 text-[11px]">{h.consigneeName || "—"} · {h.pod || "?"}</span>
            <button onClick={() => act("d" + h.id, () => fwd.detachHouse(file.id, h.id), "House detached")} disabled={busy === "d" + h.id}
              className="ml-auto text-white/25 hover:text-rose-300 disabled:opacity-40">
              {busy === "d" + h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
        {view && view.houses.length === 0 && <p className="text-xs text-white/30">No house files attached yet.</p>}
      </div>

      <div className="flex gap-2 pt-1">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} flex-1`}>
          <option value="">Attach a house file…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.fileNumber} — {c.consigneeName || "—"} ({c.pod || "?"})</option>)}
        </select>
        <button onClick={() => { if (pick) { act("att", () => fwd.attachHouse(file.id, pick), "House attached"); setPick(""); } }} disabled={!pick || busy === "att"}
          className="flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-200 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Attach</button>
      </div>
    </Section>
  );
}
