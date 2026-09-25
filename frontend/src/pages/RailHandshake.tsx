import { useCallback, useEffect, useState } from "react";
import {
  Handshake,
  RefreshCw,
  Plus,
  AlertTriangle,
  ShieldAlert,
  Gavel,
  CircleDot,
  Loader2,
  X,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Banknote,
} from "lucide-react";
import {
  getHandshakeOverview,
  listHandshakeReports,
  getHandshakeReport,
  createHandshakeReport,
  issueHandshakeReport,
  signOffHandshakeReport,
  runHandshakeEscalation,
  logDeviation,
  reviewDeviation,
  resolveDeviation,
  lodgeDispute,
  RESPONSIBLE_PARTY_LABEL,
  ESCALATION_LABEL,
  DEVIATION_CATEGORY_LABEL,
  type HandshakeOverview,
  type HandshakeReport,
  type HandshakeDeviation,
  type DeviationCategory,
  type ResponsibleParty,
  type SlotImpact,
} from "../api/railHandshakeApi";
import { useToast } from "../components/ToastProvider";

const money = (v?: number | null) =>
  v == null ? "R0" : `R${Math.round(v).toLocaleString("en-ZA")}`;

const REPORT_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  PENDING_TOC: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SIGNED_OFF: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  DISPUTED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  CLOSED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const DEV_STATUS_STYLE: Record<string, string> = {
  LOGGED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  AGREED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  OPEN: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  RESOLVED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  DISPUTED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2">
        <span className={tone ?? "text-emerald-400"}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const CATEGORIES: DeviationCategory[] = [
  "DELAY", "CANCELLATION", "NO_SHOW", "RESCHEDULE", "INFRASTRUCTURE",
  "ROLLING_STOCK", "OPERATIONAL", "SECURITY", "WEATHER", "OTHER",
];
const PARTIES: ResponsibleParty[] = [
  "UNDETERMINED", "IM", "THIS_TOC", "ANOTHER_TOC", "EXTERNAL", "FORCE_MAJEURE",
];
const IMPACTS: SlotImpact[] = ["NONE", "NOT_USED", "CANCELLED", "RESCHEDULED", "DELAYED"];

const canLodgeRegulatorDispute = (stage: string) =>
  stage === "ROUTE_LOGISTICS_FORUM" || stage === "REGULATOR_DISPUTE";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none";

export default function RailHandshake() {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<HandshakeOverview | null>(null);
  const [reports, setReports] = useState<HandshakeReport[]>([]);
  const [selected, setSelected] = useState<HandshakeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, rs] = await Promise.all([
        getHandshakeOverview().catch(() => null),
        listHandshakeReports().catch(() => []),
      ]);
      setOverview(ov);
      setReports(rs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function openReport(id: string) {
    try {
      const r = await getHandshakeReport(id);
      setSelected(r);
    } catch (e: any) {
      showToast(e?.message || "Could not open report", "error");
    }
  }

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      showToast(ok, "success");
      await load();
      if (selected) await openReport(selected.id);
    } catch (e: any) {
      showToast(e?.message || "Action failed", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
            <Handshake className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Daily Handshake</h1>
            <p className="text-sm text-slate-400">
              TOC ↔ Infrastructure Manager deviation reconciliation · Network Statement Annexure 28
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25"
          >
            <Plus className="h-4 w-4" /> New daily report
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={<FileText className="h-4 w-4" />} label="Reports" value={overview?.totalReports ?? "—"} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Open items" tone="text-amber-400"
          value={overview?.openItems ?? "—"} sub="red-flagged, on the ladder" />
        <Kpi icon={<ShieldAlert className="h-4 w-4" />} label="Disputes" tone="text-rose-400"
          value={overview?.disputes ?? "—"} />
        <Kpi icon={<Gavel className="h-4 w-4" />} label="At Regulator" tone="text-rose-400"
          value={overview?.atRegulator ?? "—"} />
        <Kpi icon={<Banknote className="h-4 w-4" />} label="Recoverable" tone="text-emerald-400"
          value={money(overview?.recoverableExposureZar)} sub="not our fault, unrecovered" />
      </div>

      {/* Responsible-party breakdown */}
      {overview && overview.byResponsibleParty.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-300">
            Who's causing the deviations
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.byResponsibleParty.map((p) => (
              <div key={p.responsibleParty} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{RESPONSIBLE_PARTY_LABEL[p.responsibleParty]}</span>
                  <span className="text-xs text-slate-400">{p.count} items</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {p.totalDelayMinutes} delay min · {money(p.totalCostZar)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report list */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-300">Daily reports</h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : reports.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No handshake reports yet. Create a daily report to start reconciling deviations with the IM.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-2">Report</th>
                  <th className="px-4 py-2">Operating day</th>
                  <th className="px-4 py-2">Corridor / IM</th>
                  <th className="px-4 py-2">Open</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reports.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => void openReport(r.id)}>
                    <td className="px-4 py-2.5 font-semibold text-white">{r.reportNumber}</td>
                    <td className="px-4 py-2.5 text-slate-300">{new Date(r.reportDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {r.corridor || "—"}{r.railOperator ? ` · ${r.railOperator}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      {(r.openItems ?? 0) > 0
                        ? <span className="font-semibold text-amber-300">{r.openItems}</span>
                        : <span className="text-slate-500">0</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge label={r.status.replace("_", " ")} cls={REPORT_STATUS_STYLE[r.status] ?? ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report detail drawer */}
      {selected && (
        <ReportDrawer
          report={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onLogDeviation={() => setShowLog(true)}
          onIssue={() => act("issue", () => issueHandshakeReport(selected.id), "Report issued for review")}
          onSignOff={() => {
            const name = window.prompt("Sign off as (name / role):");
            if (name) void act("signoff", () => signOffHandshakeReport(selected.id, name), "Report signed off");
          }}
          onRunEscalation={() => act("escalate", () => runHandshakeEscalation(selected.id), "Escalation ladder updated")}
          onReview={(dev, agree) => {
            if (agree) return act(`rev-${dev.id}`, () => reviewDeviation(selected.id, dev.id, true), "Marked agreed");
            const reason = window.prompt("Reason for flagging this item OPEN (dispute reason):");
            if (reason) void act(`rev-${dev.id}`, () => reviewDeviation(selected.id, dev.id, false, reason), "Flagged OPEN");
          }}
          onResolve={(dev) => {
            const note = window.prompt("Resolution note (optional):") ?? undefined;
            void act(`res-${dev.id}`, () => resolveDeviation(selected.id, dev.id, { resolutionNote: note }), "Deviation resolved");
          }}
          onDispute={(dev) => {
            if (window.confirm("Lodge this item as a formal dispute with the Regulator?"))
              void act(`dis-${dev.id}`, () => lodgeDispute(selected.id, dev.id), "Dispute lodged with Regulator");
          }}
        />
      )}

      {/* Create report modal */}
      {showCreate && (
        <CreateReportModal
          busy={busy === "create"}
          onClose={() => setShowCreate(false)}
          onCreate={(dto) =>
            act("create", async () => { await createHandshakeReport(dto); setShowCreate(false); }, "Daily report created")
          }
        />
      )}

      {/* Log deviation modal */}
      {showLog && selected && (
        <LogDeviationModal
          busy={busy === "logdev"}
          onClose={() => setShowLog(false)}
          onLog={(dto) =>
            act("logdev", async () => { await logDeviation(selected.id, dto); setShowLog(false); }, "Deviation logged")
          }
        />
      )}
    </div>
  );
}

// ── Report detail drawer ──────────────────────────────────────────────────────
function ReportDrawer({
  report, busy, onClose, onLogDeviation, onIssue, onSignOff, onRunEscalation, onReview, onResolve, onDispute,
}: {
  report: HandshakeReport;
  busy: string;
  onClose: () => void;
  onLogDeviation: () => void;
  onIssue: () => void;
  onSignOff: () => void;
  onRunEscalation: () => void;
  onReview: (dev: HandshakeDeviation, agree: boolean) => void;
  onResolve: (dev: HandshakeDeviation) => void;
  onDispute: (dev: HandshakeDeviation) => void;
}) {
  const devs = report.deviations ?? [];
  const editable = report.status !== "CLOSED" && report.status !== "DISPUTED";
  const canLogDeviation = report.status === "DRAFT" || report.status === "PENDING_TOC";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[#0b0f14] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">{report.reportNumber}</h2>
              <Badge label={report.status.replace("_", " ")} cls={REPORT_STATUS_STYLE[report.status] ?? ""} />
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Operating day {new Date(report.reportDate).toLocaleDateString()} ·{" "}
              {report.corridor || "no corridor"}{report.railOperator ? ` · ${report.railOperator}` : ""}
            </p>
            {report.signedOffBy && (
              <p className="mt-0.5 text-xs text-slate-500">
                Signed off by {report.signedOffBy}{report.signedOffAt ? ` · ${new Date(report.signedOffAt).toLocaleString()}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Report actions */}
        <div className="mb-5 flex flex-wrap gap-2">
          {canLogDeviation && (
            <button onClick={onLogDeviation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.07]">
              <Plus className="h-3.5 w-3.5" /> Log deviation
            </button>
          )}
          {report.status === "DRAFT" && (
            <button onClick={onIssue} disabled={busy === "issue"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">
              <ArrowUpRight className="h-3.5 w-3.5" /> Issue for review
            </button>
          )}
          {(report.status === "PENDING_TOC" || report.status === "SIGNED_OFF") && (
            <button onClick={onSignOff} disabled={busy === "signoff"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sign off
            </button>
          )}
          <button onClick={onRunEscalation} disabled={busy === "escalate"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.07] disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "escalate" ? "animate-spin" : ""}`} /> Run escalation ladder
          </button>
        </div>

        {/* Deviations */}
        {devs.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] py-10 text-center text-sm text-slate-500">
            No deviations logged for this operating day.
          </div>
        ) : (
          <div className="space-y-3">
            {devs.map((d) => (
              <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{d.trainSlotRef}</span>
                      {d.orderNumber && <span className="text-xs text-slate-500">Order {d.orderNumber}</span>}
                      <Badge label={d.status} cls={DEV_STATUS_STYLE[d.status] ?? ""} />
                    </div>
                    <div className="mt-1 text-sm text-slate-300">
                      <span className="text-slate-400">{DEVIATION_CATEGORY_LABEL[d.category]}:</span> {d.reason}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>Responsible: <span className="text-slate-300">{RESPONSIBLE_PARTY_LABEL[d.responsibleParty]}</span></span>
                      {d.delayMinutes != null && <span>{d.delayMinutes} min delay</span>}
                      {d.costZar != null && <span>{money(d.costZar)}{d.costRecovered ? " · recovered" : ""}</span>}
                      {d.slotImpact !== "NONE" && <span>Slot: {d.slotImpact.replace("_", " ")}</span>}
                    </div>
                    {d.status === "OPEN" && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                        <CircleDot className="h-3 w-3" /> {ESCALATION_LABEL[d.escalationStage]}
                        {d.disputeReason && <span className="font-normal text-slate-400">· {d.disputeReason}</span>}
                      </div>
                    )}
                    {d.resolutionNote && (
                      <div className="mt-2 text-[11px] text-sky-300">Resolved: {d.resolutionNote}</div>
                    )}
                  </div>
                </div>

                {/* Deviation actions */}
                {editable && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                    {(d.status === "LOGGED") && (
                      <>
                        <button onClick={() => onReview(d, true)} disabled={busy === `rev-${d.id}`}
                          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                          Agree
                        </button>
                        <button onClick={() => onReview(d, false)} disabled={busy === `rev-${d.id}`}
                          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
                          Flag OPEN
                        </button>
                      </>
                    )}
                    {d.status === "OPEN" && (
                      <>
                        <button onClick={() => onResolve(d)} disabled={busy === `res-${d.id}`}
                          className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
                          Resolve
                        </button>
                        {canLodgeRegulatorDispute(d.escalationStage) && (
                          <button onClick={() => onDispute(d)} disabled={busy === `dis-${d.id}`}
                            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
                            Lodge dispute
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create report modal ────────────────────────────────────────────────────────
function CreateReportModal({ busy, onClose, onCreate }: {
  busy: boolean; onClose: () => void;
  onCreate: (dto: { reportDate?: string; railOperator?: string; corridor?: string; imReference?: string }) => void;
}) {
  const [reportDate, setReportDate] = useState("");
  const [railOperator, setRailOperator] = useState("");
  const [corridor, setCorridor] = useState("");
  const [imReference, setImReference] = useState("");
  return (
    <Modal title="New daily handshake report" onClose={onClose}>
      <label className="block text-xs font-semibold text-slate-400">Operating day (defaults to yesterday)</label>
      <input type="date" className={inputCls} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      <label className="mt-3 block text-xs font-semibold text-slate-400">Infrastructure Manager</label>
      <input className={inputCls} placeholder="e.g. TRIM" value={railOperator} onChange={(e) => setRailOperator(e.target.value)} />
      <label className="mt-3 block text-xs font-semibold text-slate-400">Corridor</label>
      <input className={inputCls} placeholder="e.g. North / Cape / Ore / Container" value={corridor} onChange={(e) => setCorridor(e.target.value)} />
      <label className="mt-3 block text-xs font-semibold text-slate-400">IM reference (TOL)</label>
      <input className={inputCls} placeholder="optional" value={imReference} onChange={(e) => setImReference(e.target.value)} />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
        <button
          onClick={() => onCreate({
            reportDate: reportDate || undefined,
            railOperator: railOperator || undefined,
            corridor: corridor || undefined,
            imReference: imReference || undefined,
          })}
          disabled={busy}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create report"}
        </button>
      </div>
    </Modal>
  );
}

// ── Log deviation modal ─────────────────────────────────────────────────────────
function LogDeviationModal({ busy, onClose, onLog }: {
  busy: boolean; onClose: () => void; onLog: (dto: Partial<HandshakeDeviation>) => void;
}) {
  const [trainSlotRef, setTrainSlotRef] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [category, setCategory] = useState<DeviationCategory>("DELAY");
  const [reason, setReason] = useState("");
  const [responsibleParty, setResponsibleParty] = useState<ResponsibleParty>("UNDETERMINED");
  const [slotImpact, setSlotImpact] = useState<SlotImpact>("DELAYED");
  const [delayMinutes, setDelayMinutes] = useState("");
  const [costZar, setCostZar] = useState("");
  const [location, setLocation] = useState("");

  const canSave = trainSlotRef.trim() && reason.trim();
  return (
    <Modal title="Log deviation" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-400">Train / Slot ref *</label>
          <input className={inputCls} value={trainSlotRef} onChange={(e) => setTrainSlotRef(e.target.value)} placeholder="e.g. NS-0412 / Slot 118" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Order number</label>
          <input className={inputCls} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Category</label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as DeviationCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{DEVIATION_CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Slot impact</label>
          <select className={inputCls} value={slotImpact} onChange={(e) => setSlotImpact(e.target.value as SlotImpact)}>
            {IMPACTS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Responsible party</label>
          <select className={inputCls} value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value as ResponsibleParty)}>
            {PARTIES.map((c) => <option key={c} value={c}>{RESPONSIBLE_PARTY_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Location</label>
          <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Delay (minutes)</label>
          <input type="number" min="0" className={inputCls} value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400">Cost (ZAR)</label>
          <input type="number" min="0" className={inputCls} value={costZar} onChange={(e) => setCostZar(e.target.value)} />
        </div>
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-400">Reason / description *</label>
      <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened" />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
        <button
          onClick={() => onLog({
            trainSlotRef: trainSlotRef.trim(),
            orderNumber: orderNumber || undefined,
            category, reason: reason.trim(), responsibleParty, slotImpact,
            location: location || undefined,
            delayMinutes: delayMinutes ? Number(delayMinutes) : undefined,
            costZar: costZar ? Number(costZar) : undefined,
          })}
          disabled={busy || !canSave}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Log deviation"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0f14] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
