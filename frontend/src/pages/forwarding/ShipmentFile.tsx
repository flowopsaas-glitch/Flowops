import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, Plus, Trash2, Sparkles, Wand2, FileText, Truck, AlertTriangle,
  Box, Package, DollarSign, Anchor, ChevronRight, CheckCircle2,
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
            <button onClick={() => run("deliv", async () => { const r = await fwd.createDelivery(id); showToast("Domestic delivery created", "success"); }, undefined)} disabled={!!busy}
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
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
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
