import { errorMessageOf } from "@/components/patterns/errorMessage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDismissOnEscape } from "../components/patterns/useDismissOnEscape";
import {
  Calculator, Sparkles, FileMinus, FilePlus, ScrollText, Layers, Percent,
  Download, Plus, X, RefreshCw, CheckCircle2, Banknote, AlertTriangle, TrendingUp,
  Plug, ShieldCheck, Link2,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "../components/toast-context";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import {
  listCreditNotes, createCreditNote, issueCreditNote, applyCreditNote, voidCreditNote,
  listDebitNotes, createDebitNote, issueDebitNote, settleDebitNote, voidDebitNote,
  getStatement, getAgeAnalysis, getAiAssist,
  listSalespeople, createSalesperson, listCommissions, commissionSummary,
  generateCommissions, approveCommission, payCommission, downloadExport,
  type CreditNote, type DebitNote, type Statement, type AgeAnalysis, type AiAssist,
  type Salesperson, type Commission, type CommissionSummaryRow,
} from "../api/accountingApi";
import {
  listIntegrations, reconcileBooks, authorizeProvider, connectPastel,
  disconnectIntegration, downloadPastelImport,
  type IntegrationStatus, type Reconciliation, type ProviderKey,
} from "../api/accountingIntegrationsApi";

const glassCard = (c?: string) =>
  cn("rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl fx-lift", c);
const money = (n?: number | null) =>
  `R${Number(n ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const thisMonth = () => new Date().toISOString().slice(0, 7);

type TabKey = "ai" | "credit" | "debit" | "statements" | "aging" | "commission" | "bridge";
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "ai", label: "AI Assist", icon: Sparkles },
  { key: "bridge", label: "AI Bridge", icon: Link2 },
  { key: "credit", label: "Credit Notes", icon: FileMinus },
  { key: "debit", label: "Debit Notes", icon: FilePlus },
  { key: "statements", label: "Statements", icon: ScrollText },
  { key: "aging", label: "Age Analysis", icon: Layers },
  { key: "commission", label: "Commission", icon: Percent },
];

const STATUS_CLS: Record<string, string> = {
  DRAFT: "text-white/60 bg-white/5 border-white/10",
  ISSUED: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  APPLIED: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30",
  SETTLED: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30",
  VOID: "text-rose-300 bg-rose-400/10 border-rose-400/30",
  PENDING: "text-amber-300 bg-amber-400/10 border-amber-400/30",
  APPROVED: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  PAID: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30",
};

export default function Accounting() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("ai");

  return (
    <div className="p-4 md:p-8 space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300"><Calculator className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Accounting</h1>
            <p className="text-sm text-white/50">Credit &amp; debit notes, statements, age analysis, sales commission &amp; Pastel export — with AI assist.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton onPick={async (t) => { try { await downloadExport(t); } catch (e) { showToast(errorMessageOf(e) || "Export failed", "error"); } }} />
        </div>
      </div>

      {/* Tabs */}
      <div className={glassCard("p-1.5 flex flex-wrap gap-1")}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "ai" && <AiAssistPanel />}
      {tab === "bridge" && <BridgeTab />}
      {tab === "credit" && <CreditNotesTab />}
      {tab === "debit" && <DebitNotesTab />}
      {tab === "statements" && <StatementsTab />}
      {tab === "aging" && <AgingTab />}
      {tab === "commission" && <CommissionTab />}
    </div>
  );
}

// ── Export dropdown ───────────────────────────────────────────────────────
function ExportButton({ onPick }: { onPick: (t: "invoices" | "credit-notes" | "payments" | "pastel") => void }) {
  const [open, setOpen] = useState(false);
  const opts: { t: "invoices" | "credit-notes" | "payments" | "pastel"; label: string }[] = [
    { t: "pastel", label: "Pastel journal (CSV)" },
    { t: "invoices", label: "Invoices (CSV)" },
    { t: "credit-notes", label: "Credit notes (CSV)" },
    { t: "payments", label: "Payments (CSV)" },
  ];
  return (
    <div className="relative">
      <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => setOpen((v) => !v)}>
        <Download className="mr-2 h-4 w-4" /> Export
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" ><button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setOpen(false)} /></div>
          <div className={glassCard("absolute right-0 z-20 mt-2 w-56 p-1.5")}>
            {opts.map((o) => (
              <button key={o.t} onClick={() => { setOpen(false); onPick(o.t); }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── AI Assist panel ─────────────────────────────────────────────────────
function AiAssistPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<AiAssist | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => (async () => {
 setData(await getAiAssist());
  })().catch((e: unknown) => {
 showToast(errorMessageOf(e) || "AI assist unavailable", "error");
  }).finally(() => {
 setLoading(false);
  }), [showToast]);
  useEffect(() => { void load(); }, [load]);

  const riskColor = (s: number) => s >= 60 ? "text-rose-300" : s >= 30 ? "text-amber-300" : "text-emerald-300";
  const prioCls = (p: string) => p === "HIGH" ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
    : p === "MEDIUM" ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
    : "border-white/10 bg-white/5 text-white/70";

  if (loading) return <div className={glassCard("p-10 text-center text-white/40")}>FlowOps AI is analysing your receivables…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className={glassCard("p-5")}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><Sparkles className="h-5 w-5" /></div>
            <div>
              <div className="text-xs uppercase tracking-wide text-violet-300/80 font-bold">{data.assistant} · Finance briefing</div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/80">{data.summary}</p>
            </div>
          </div>
          <button onClick={() => void load()} title="Re-run" className="text-white/40 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Risk score" value={<span className={riskColor(data.riskScore)}>{data.riskScore}/100</span>} />
          <Kpi label="Outstanding" value={money(data.kpis.totalOutstanding)} />
          <Kpi label="60+ overdue" value={money(data.kpis.seriouslyOverdue)} />
          <Kpi label="Collected 30d" value={money(data.kpis.collectedLast30)} />
          <Kpi label="Pending commission" value={money(data.kpis.pendingCommission)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={glassCard("p-5")}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white/60"><TrendingUp className="h-4 w-4" /> Recommended actions</h3>
          <div className="space-y-2">
            {data.recommendations.map((r, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", prioCls(r.priority))}>{r.priority}</span>
                  <span className="text-sm font-semibold">{r.title}</span>
                </div>
                <p className="mt-1 text-xs text-white/55">{r.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={glassCard("p-5")}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white/60"><Banknote className="h-4 w-4" /> Collection targets</h3>
          {data.collectionTargets.length === 0 && <p className="text-sm text-white/40">No outstanding balances. 🎉</p>}
          <div className="space-y-2">
            {data.collectionTargets.map((t, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.client}</span>
                  <span className="font-mono text-sm">{money(t.outstanding)}</span>
                </div>
                <p className="mt-1 text-xs text-white/55">{t.action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.creditRisks.length > 0 && (
        <div className={glassCard("p-5 border-rose-400/20")}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-rose-300"><AlertTriangle className="h-4 w-4" /> Over credit limit</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {data.creditRisks.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm">
                <span className="font-semibold">{c.client}</span>
                <span className="text-white/60">{money(c.outstanding)} / {money(c.creditLimit)} · <span className="text-rose-300 font-bold">+{money(c.over)}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const Kpi = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
    <div className="text-lg font-black leading-none">{value}</div>
    <div className="mt-1 text-[10px] uppercase tracking-wide text-white/40">{label}</div>
  </div>
);

// ── Credit Notes tab ──────────────────────────────────────────────────────
function CreditNotesTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => (async () => {
    try { setRows(await listCreditNotes()); }
    catch (e) { showToast(errorMessageOf(e) || "Failed to load credit notes", "error"); }
    finally { setLoading(false); }
  })(), [showToast]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); showToast(ok, "success"); await load(); }
    catch (e) { showToast(errorMessageOf(e) || "Action failed", "error"); }
  }

  function onApply(cn: CreditNote) {
    const amtStr = window.prompt(`Apply how much of ${cn.number}? (remaining ${money(cn.total - cn.appliedAmount)})`,
      String(cn.total - cn.appliedAmount));
    if (amtStr == null) return;
    const amount = Number(amtStr);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    const invoiceId = window.prompt("Invoice id to offset against (optional):", cn.invoiceId ?? "") || undefined;
    void act(() => applyCreditNote(cn.id, { amount, invoiceId }), `${cn.number} applied`);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => void load()}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
        </Button>
        <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Credit Note
        </Button>
      </div>
      <NotesTable
        rows={rows} loading={loading} kind="credit"
        renderActions={(cn) => (
          <>
            {cn.status === "DRAFT" && <ActBtn onClick={() => void act(() => issueCreditNote(cn.id), `${cn.number} issued`)}>Issue</ActBtn>}
            {cn.status === "ISSUED" && <ActBtn tone="ok" onClick={() => onApply(cn)}>Apply</ActBtn>}
            {cn.status !== "APPLIED" && cn.status !== "VOID" && <ActBtn tone="bad" onClick={() => void act(() => voidCreditNote(cn.id), `${cn.number} voided`)}>Void</ActBtn>}
          </>
        )}
      />
      {open && <NoteModal kind="credit" onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load(); }} />}
    </div>
  );
}

// ── Debit Notes tab ─────────────────────────────────────────────────────
function DebitNotesTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => (async () => {
    try { setRows(await listDebitNotes()); }
    catch (e) { showToast(errorMessageOf(e) || "Failed to load debit notes", "error"); }
    finally { setLoading(false); }
  })(), [showToast]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); showToast(ok, "success"); await load(); }
    catch (e) { showToast(errorMessageOf(e) || "Action failed", "error"); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => void load()}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
        </Button>
        <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Debit Note
        </Button>
      </div>
      <NotesTable
        rows={rows} loading={loading} kind="debit"
        renderActions={(dn) => (
          <>
            {dn.status === "DRAFT" && <ActBtn onClick={() => void act(() => issueDebitNote(dn.id), `${dn.number} issued`)}>Issue</ActBtn>}
            {dn.status === "ISSUED" && <ActBtn tone="ok" onClick={() => void act(() => settleDebitNote(dn.id), `${dn.number} settled`)}>Settle</ActBtn>}
            {dn.status !== "SETTLED" && dn.status !== "VOID" && <ActBtn tone="bad" onClick={() => void act(() => voidDebitNote(dn.id), `${dn.number} voided`)}>Void</ActBtn>}
          </>
        )}
      />
      {open && <NoteModal kind="debit" onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load(); }} />}
    </div>
  );
}

function NotesTable<T extends CreditNote | DebitNote>({ rows, loading, kind, renderActions }: {
  rows: T[]; loading: boolean; kind: "credit" | "debit";
  renderActions: (r: T) => React.ReactNode;
}) {
  return (
    <div className={glassCard("overflow-hidden")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-white/40">
            <tr>
              <th className="p-3">Number</th><th className="p-3">Client</th><th className="p-3">Reason</th>
              <th className="p-3">Total</th>{kind === "credit" && <th className="p-3">Applied</th>}
              <th className="p-3">Status</th><th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && <tr><td colSpan={7} className="p-10 text-center text-white/40">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-white/40">None yet.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="p-3 font-mono font-bold text-emerald-300">{r.number}</td>
                <td className="p-3">{r.clientName}</td>
                <td className="p-3 text-white/60">{r.reason || "—"}</td>
                <td className="p-3 font-mono">{money(r.total)}</td>
                {kind === "credit" && <td className="p-3 font-mono text-white/60">{money((r as CreditNote).appliedAmount)}</td>}
                <td className="p-3"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold", STATUS_CLS[r.status])}>{pretty(r.status)}</span></td>
                <td className="p-3"><div className="flex justify-end gap-1.5">{renderActions(r)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Statements tab ────────────────────────────────────────────────────────
function StatementsTab() {
  const { showToast } = useToast();
  const [client, setClient] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);

  async function run() {
    if (!client.trim()) { showToast("Enter a client name", "error"); return; }
    try { setStmt(await getStatement(client.trim(), from || undefined, to || undefined)); }
    catch (e) { showToast(errorMessageOf(e) || "Could not build statement", "error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-3">
      <div className={glassCard("p-3 flex flex-wrap items-end gap-3")}>
        <label className="flex-1 min-w-[200px]"><span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Client name</span>
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="exact client name"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50" /></label>
        <label><span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></label>
        <label><span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></label>
        <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold" disabled={loading} onClick={() => void run()}>
          {loading ? "Building…" : "Generate"}
        </Button>
      </div>

      {stmt && (
        <div className={glassCard("p-5")}>
          <div className="mb-4 flex flex-wrap justify-between gap-3">
            <div>
              <div className="text-lg font-black">{stmt.client}</div>
              <div className="text-xs text-white/40">{stmt.from.slice(0, 10)} → {stmt.to.slice(0, 10)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40">Closing balance</div>
              <div className={cn("text-2xl font-black", stmt.closingBalance > 0 ? "text-amber-300" : "text-emerald-300")}>{money(stmt.closingBalance)}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-white/40">
                <tr><th className="p-3">Date</th><th className="p-3">Ref</th><th className="p-3">Description</th>
                  <th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th><th className="p-3 text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="text-white/50"><td className="p-3" colSpan={5}>Opening balance</td><td className="p-3 text-right font-mono">{money(stmt.openingBalance)}</td></tr>
                {stmt.lines.map((l, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="p-3 text-white/60">{l.date.slice(0, 10)}</td>
                    <td className="p-3 font-mono text-xs">{l.ref}</td>
                    <td className="p-3">{l.description}</td>
                    <td className="p-3 text-right font-mono">{l.debit ? money(l.debit) : "—"}</td>
                    <td className="p-3 text-right font-mono text-emerald-300">{l.credit ? money(l.credit) : "—"}</td>
                    <td className="p-3 text-right font-mono">{money(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Age Analysis tab ──────────────────────────────────────────────────────
function AgingTab() {
  const { showToast } = useToast();
  const [data, setData] = useState<AgeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setData(await getAgeAnalysis()); }
      catch (e) { showToast(errorMessageOf(e) || "Failed", "error"); }
      finally { setLoading(false); }
    })();
  }, [showToast]);

  if (loading) return <div className={glassCard("p-10 text-center text-white/40")}>Loading age analysis…</div>;
  if (!data) return null;
  const cols: { k: keyof AgeAnalysis["totals"]; label: string }[] = [
    { k: "current", label: "Current" }, { k: "d30", label: "1–30" }, { k: "d60", label: "31–60" },
    { k: "d90", label: "61–90" }, { k: "d90plus", label: "90+" }, { k: "total", label: "Total" },
  ];
  return (
    <div className={glassCard("overflow-hidden")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-white/40">
            <tr><th className="p-3">Client</th>{cols.map((c) => <th key={c.k} className="p-3 text-right">{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.clients.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-white/40">No outstanding invoices.</td></tr>}
            {data.clients.map((r) => (
              <tr key={r.clientName} className="hover:bg-white/[0.02]">
                <td className="p-3 font-semibold">{r.clientName}</td>
                {cols.map((c) => (
                  <td key={c.k} className={cn("p-3 text-right font-mono", c.k === "d90plus" && r.d90plus > 0 && "text-rose-300", c.k === "total" && "font-bold")}>
                    {money(r[c.k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {data.clients.length > 0 && (
            <tfoot className="bg-white/[0.04] font-bold">
              <tr><td className="p-3">Totals</td>{cols.map((c) => <td key={c.k} className="p-3 text-right font-mono">{money(data.totals[c.k])}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Commission tab ────────────────────────────────────────────────────────
function CommissionTab() {
  const { showToast } = useToast();
  const [people, setPeople] = useState<Salesperson[]>([]);
  const [rows, setRows] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [spName, setSpName] = useState("");
  const [spPct, setSpPct] = useState("");
  const [genSp, setGenSp] = useState("");
  const [genPeriod, setGenPeriod] = useState(thisMonth());

  const load = useCallback(() => (async () => {
    try {
      const [p, c, s] = await Promise.all([listSalespeople(), listCommissions(), commissionSummary()]);
      setPeople(p); setRows(c); setSummary(s);
      if (!genSp && p[0]) setGenSp(p[0].id);
    } catch (e) { showToast(errorMessageOf(e) || "Failed to load commission", "error"); }
    finally { setLoading(false); }
  })(), [showToast, genSp]);
  useEffect(() => { void load(); }, [load]);

  async function addSalesperson() {
    if (!spName.trim()) { showToast("Name required", "error"); return; }
    try {
      await createSalesperson({ name: spName.trim(), defaultCommissionPct: spPct ? Number(spPct) : 0 });
      setSpName(""); setSpPct(""); showToast("Salesperson added", "success"); await load();
    } catch (e) { showToast(errorMessageOf(e) || "Failed", "error"); }
  }

  async function generate() {
    if (!genSp) { showToast("Pick a salesperson", "error"); return; }
    try {
      const r = await generateCommissions({ salespersonId: genSp, periodMonth: genPeriod });
      showToast(`${r.created} commission(s) created (${money(r.totalCommission)}), ${r.skipped} skipped`, "success");
      await load();
    } catch (e) { showToast(errorMessageOf(e) || "Generate failed", "error"); }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); showToast(ok, "success"); await load(); }
    catch (e) { showToast(errorMessageOf(e) || "Action failed", "error"); }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={glassCard("p-4")}>
          <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-white/60">Salespeople</h3>
          <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
            {people.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm">
                <span>{p.name}</span><span className="text-white/40">{p.defaultCommissionPct}%</span>
              </div>
            ))}
            {people.length === 0 && <p className="text-sm text-white/40">No salespeople yet.</p>}
          </div>
          <div className="flex gap-2">
            <input value={spName} onChange={(e) => setSpName(e.target.value)} placeholder="Name"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50" />
            <input value={spPct} onChange={(e) => setSpPct(e.target.value)} placeholder="%" style={{ width: 70 }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50" />
            <Button className="bg-white/10 hover:bg-white/20" onClick={() => void addSalesperson()}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className={glassCard("p-4")}>
          <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-white/60">Generate from paid invoices</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[140px]"><span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Salesperson</span>
              <select value={genSp} onChange={(e) => setGenSp(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Period</span>
              <input type="month" value={genPeriod} onChange={(e) => setGenPeriod(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></label>
            <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold" onClick={() => void generate()}>Generate</Button>
          </div>
          <p className="mt-2 text-xs text-white/40">Creates commission at the salesperson's default rate for every invoice paid in the selected month.</p>
        </div>
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summary.map((s) => (
            <div key={s.salespersonId} className={glassCard("p-4")}>
              <div className="text-sm font-bold">{s.name}</div>
              <div className="mt-1 text-2xl font-black text-emerald-300">{money(s.total)}</div>
              <div className="mt-1 text-[11px] text-white/40">Pending {money(s.pending)} · Paid {money(s.paid)}</div>
            </div>
          ))}
        </div>
      )}

      <div className={glassCard("overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-white/40">
              <tr><th className="p-3">Salesperson</th><th className="p-3">Period</th><th className="p-3">Invoice</th>
                <th className="p-3 text-right">Base</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Commission</th>
                <th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && <tr><td colSpan={8} className="p-10 text-center text-white/40">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-white/40">No commission records yet.</td></tr>}
              {!loading && rows.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="p-3 font-semibold">{c.salesperson?.name ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{c.periodMonth}</td>
                  <td className="p-3 font-mono text-xs text-white/60">{c.invoice?.invoiceNumber ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{money(c.baseAmount)}</td>
                  <td className="p-3 text-right font-mono">{c.ratePct}%</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-300">{money(c.amount)}</td>
                  <td className="p-3"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold", STATUS_CLS[c.status])}>{pretty(c.status)}</span></td>
                  <td className="p-3"><div className="flex justify-end gap-1.5">
                    {c.status === "PENDING" && <ActBtn onClick={() => void act(() => approveCommission(c.id), "Approved")}>Approve</ActBtn>}
                    {(c.status === "PENDING" || c.status === "APPROVED") && <ActBtn tone="ok" onClick={() => void act(() => payCommission(c.id), "Marked paid")}><CheckCircle2 className="h-3.5 w-3.5" /></ActBtn>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Create note modal ─────────────────────────────────────────────────────
function NoteModal({ kind, onClose, onCreated }: { kind: "credit" | "debit"; onClose: () => void; onCreated: () => void }) {
  useDismissOnEscape(true, onClose);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<{ description: string; quantity: string; unitPrice: string }[]>([
    { description: "", quantity: "1", unitPrice: "" },
  ]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items],
  );

  function setItem(i: number, patch: Partial<{ description: string; quantity: string; unitPrice: string }>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit() {
    if (!clientName.trim()) { showToast("Client name required", "error"); return; }
    const clean = items.filter((it) => it.description.trim() && Number(it.unitPrice) > 0)
      .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 1, unitPrice: Number(it.unitPrice) }));
    if (!clean.length) { showToast("Add at least one line item", "error"); return; }
    setSaving(true);
    try {
      const payload = { clientName: clientName.trim(), invoiceId: invoiceId.trim() || undefined, reason: reason.trim() || undefined, items: clean };
      if (kind === "credit") await createCreditNote(payload); else await createDebitNote(payload);
      showToast(`${kind === "credit" ? "Credit" : "Debit"} note created`, "success");
      onCreated();
    } catch (e) { showToast(errorMessageOf(e) || "Create failed", "error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />
      <div className={glassCard("w-full max-w-xl p-5")} role="dialog">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">New {kind === "credit" ? "Credit" : "Debit"} Note</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name *"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50" />
            <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice id (optional)"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50" />
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50" />
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_90px_auto] gap-2">
                <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description"
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none" />
                <input value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} placeholder="Qty"
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none text-center" />
                <input value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} placeholder="Unit R"
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none text-right" />
                <button onClick={() => setItems((a) => a.filter((_, idx) => idx !== i))} className="text-white/30 hover:text-rose-400"><X className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setItems((a) => [...a, { description: "", quantity: "1", unitPrice: "" }])}
              className="text-xs font-bold uppercase text-emerald-400 hover:text-emerald-300">+ Add line</button>
          </div>
          <div className="flex justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            <span className="text-white/50">Subtotal (VAT 15% added on save)</span>
            <span className="font-mono font-bold">{money(subtotal)}</span>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" className="border-white/10 bg-white/5" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold disabled:opacity-50" disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActBtn({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: "ok" | "bad" }) {
  return (
    <button onClick={onClick} className={cn(
      "rounded-lg border px-2.5 py-1 text-xs font-semibold",
      tone === "ok" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
        : tone === "bad" ? "border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
        : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")}>
      {children}
    </button>
  );
}


// ── AI Accounting Bridge tab ──────────────────────────────────────────────
const PROVIDER_META: Record<ProviderKey, { label: string; blurb: string }> = {
  XERO: { label: "Xero", blurb: "Two-way sync — push invoices & credit notes, auto-refresh tokens." },
  SAGE: { label: "Sage Accounting", blurb: "Push sales invoices & credit notes to Sage Business Cloud." },
  PASTEL: { label: "Sage Pastel", blurb: "Generate a Pastel Partner/Xpress import file (no API needed)." },
};

function BridgeTab() {
  const { showToast } = useToast();
  const [providers, setProviders] = useState<IntegrationStatus[]>([]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => (async () => {
    try {
      const [p, r] = await Promise.all([listIntegrations(), reconcileBooks()]);
      setProviders(p);
      setRecon(r);
    } catch (e) {
      showToast(errorMessageOf(e) || "Failed to load accounting bridge", "error");
    } finally {
      setLoading(false);
    }
  })(), [showToast]);
  useEffect(() => { void load(); }, [load]);

  // surface the OAuth redirect result if present
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("integration") === "connected") showToast(`${q.get("provider")} connected ✓`, "success");
    if (q.get("integration") === "error") showToast(`Connect failed: ${q.get("reason") || "unknown"}`, "error");
  }, [showToast]);

  async function connect(p: IntegrationStatus) {
    setBusy(p.provider);
    try {
      if (p.provider === "PASTEL") {
        await connectPastel();
        showToast("Pastel connected — use Export to download import files.", "success");
        await load();
      } else if (!p.configured) {
        showToast(`${p.name} isn't configured on the server (admin must set ${p.provider}_CLIENT_ID/SECRET).`, "error");
      } else {
        const { url } = await authorizeProvider(p.provider);
        window.location.assign(url); // OAuth redirect
      }
    } catch (e) {
      showToast(errorMessageOf(e) || "Connect failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(p: IntegrationStatus) {
    if (!p.connectionId) return;
    setBusy(p.provider);
    try { await disconnectIntegration(p.connectionId); showToast(`${p.name} disconnected`, "success"); await load(); }
    catch (e) { showToast(errorMessageOf(e) || "Failed", "error"); }
    finally { setBusy(null); }
  }

  const ring = (s: number) =>
    s >= 80 ? "text-emerald-300" : s >= 50 ? "text-amber-300" : "text-rose-300";
  const sevCls = (s: string) =>
    s === "HIGH" ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
    : s === "MEDIUM" ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
    : "border-white/10 bg-white/5 text-white/70";

  return (
    <div className="space-y-4">
      {/* Provider connections */}
      <div className="grid gap-3 md:grid-cols-3">
        {providers.map((p) => (
          <div key={p.provider} className={glassCard("p-4 flex flex-col")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-sky-300" />
                <span className="font-bold">{PROVIDER_META[p.provider]?.label ?? p.name}</span>
              </div>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold",
                p.status === "CONNECTED" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-white/50")}>
                {p.status === "CONNECTED" ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-2 flex-1 text-xs text-white/45">{PROVIDER_META[p.provider]?.blurb}</p>
            {p.tenantName && <p className="mt-1 text-[11px] text-white/40">Org: {p.tenantName}</p>}
            {p.lastError && <p className="mt-1 text-[11px] text-rose-300/80 truncate">⚠ {p.lastError}</p>}
            {!p.configured && p.usesOAuth && (
              <p className="mt-1 text-[10px] text-amber-300/70">Server credentials not set</p>
            )}
            <div className="mt-3 flex gap-2">
              {p.status === "CONNECTED" ? (
                <>
                  {p.provider === "PASTEL" && (
                    <Button className="bg-white/10 hover:bg-white/20 text-xs" onClick={() => void downloadPastelImport().catch((e) => showToast(errorMessageOf(e), "error"))}>
                      <Download className="mr-1 h-3.5 w-3.5" /> Export
                    </Button>
                  )}
                  <Button variant="outline" className="border-white/10 bg-white/5 text-xs" disabled={busy === p.provider} onClick={() => void disconnect(p)}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button className="bg-sky-500 hover:bg-sky-400 text-xs" disabled={busy === p.provider} onClick={() => void connect(p)}>
                  {busy === p.provider ? "…" : "Connect"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI reconciliation */}
      {loading ? (
        <div className={glassCard("p-10 text-center text-white/40")}>Reconciling your books…</div>
      ) : recon && (
        <div className={glassCard("p-5")}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-violet-300/80">FlowOps AI · Books reconciliation</div>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/80">{recon.summary}</p>
              </div>
            </div>
            <button onClick={() => void load()} title="Re-run" className="text-white/40 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Books health" value={<span className={ring(recon.healthScore)}>{recon.healthScore}/100</span>} />
            <Kpi label="Documents" value={recon.totals.documents} />
            <Kpi label="Synced" value={recon.totals.synced} />
            <Kpi label="Unsynced" value={recon.totals.unsynced} />
            <Kpi label="High issues" value={<span className={recon.totals.high ? "text-rose-300" : "text-emerald-300"}>{recon.totals.high}</span>} />
          </div>

          {recon.issues.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white/60"><AlertTriangle className="h-4 w-4" /> Issues to fix</h4>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {recon.issues.map((i, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-sm">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", sevCls(i.severity))}>{i.severity}</span>
                    <div>
                      <span className="font-mono text-sky-300">{i.doc}</span> · <span className="text-white/70">{i.client}</span>
                      <p className="text-xs text-white/55">{i.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recon.connected.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-black uppercase tracking-wide text-white/60">AI-suggested ledger mapping</h4>
              <div className="grid gap-2 md:grid-cols-3">
                {recon.connected.map((c) => {
                  const m = recon.suggestedMapping[c.provider];
                  if (!m) return null;
                  return (
                    <div key={c.provider} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                      <div className="mb-1 font-bold text-white/80">{c.provider}</div>
                      <div className="text-white/55">Sales: <span className="text-white/80">{m.sales}</span></div>
                      <div className="text-white/55">AR: <span className="text-white/80">{m.accountsReceivable}</span></div>
                      <div className="text-white/55">VAT: <span className="text-white/80">{m.vat}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
