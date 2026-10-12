import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { api } from "../api/client";
import { TiltCard } from "../components/premium/TiltCard";
import { formatMoney } from "../lib/currency";

/**
 * Proof & Payments — the money board.
 *
 * Principle: PROOF GATES PAYMENT. A disputed delivery is an argument, not
 * revenue. This page shows, for every lifecycle (road / rail / sea):
 *   1. the HOLD QUEUE first — every reason money is stuck and the next action;
 *   2. the PROOF BOARD — proof state vs money state per delivery.
 * Resolving a dispute here (CLEARED / UPHELD) is the act that releases or
 * confirms the hold.
 */

type Hold = {
  mode: "ROAD" | "RAIL";
  ref: string;
  epodId?: string;
  counterparty: string | null;
  amount: number | null;
  reason: string;
  nextAction: string;
  since: string | null;
};

type BoardRow = {
  mode: "ROAD" | "RAIL" | "SEA";
  ref: string;
  counterparty: string | null;
  proof: string;
  money: string;
  held: boolean;
  holdReason: string | null;
  amount: number | null;
};

const moneyTone: Record<string, string> = {
  UNBILLED: "text-sky-300",
  HELD: "text-rose-300",
  INVOICED: "text-amber-300",
  PAID: "text-emerald-300",
};

export default function ProofPayments() {
  const [loading, setLoading] = useState(true);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, b]: any[] = await Promise.all([
        api.get("/invoices/billing-holds"),
        api.get("/invoices/proof-board"),
      ]);
      setHolds(h?.holds ?? []);
      setRows(b?.rows ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (hold: Hold, resolution: "CLEARED" | "UPHELD") => {
    if (!hold.epodId) return;
    setBusyId(hold.epodId);
    try {
      await api.post(`/epod/${hold.epodId}/resolve-dispute`, {
        resolution,
        resolvedBy: "billing-desk",
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Resolution failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" data-testid="proof-payments">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <ShieldCheck className="h-6 w-6 text-emerald-300" /> Proof &amp; Payments
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Proof gates payment — every hold has a reason and a next action, across road, rail and sea.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:border-white/25"
          data-testid="refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" data-testid="error">
          {error}
        </div>
      )}

      {/* HOLD QUEUE — settle these first */}
      <TiltCard className="mb-8 rounded-2xl border border-rose-400/20 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-300" />
          <h2 className="text-lg font-semibold text-white">Billing Holds</h2>
          <span className="ml-2 rounded-full bg-rose-400/15 px-2 py-0.5 text-xs text-rose-200" data-testid="hold-count">
            {holds.length}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : holds.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-300" data-testid="no-holds">
            <CheckCircle2 className="h-4 w-4" /> No holds — money is moving.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Ref</th>
                  <th className="py-2 pr-4">Counterparty</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Why it is held</th>
                  <th className="py-2 pr-4">Next action</th>
                  <th className="py-2">Resolve</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((h, i) => (
                  <tr key={`${h.mode}-${h.ref}-${i}`} className="border-t border-white/5 align-top" data-testid="hold-row">
                    <td className="py-3 pr-4"><span className="rounded bg-white/10 px-2 py-0.5 text-xs">{h.mode}</span></td>
                    <td className="py-3 pr-4 font-mono text-xs text-white/80">{h.ref}</td>
                    <td className="py-3 pr-4 text-white/70">{h.counterparty ?? "—"}</td>
                    <td className="py-3 pr-4 text-white/90">{h.amount != null ? formatMoney(h.amount) : "—"}</td>
                    <td className="py-3 pr-4 text-rose-200/90">{h.reason}</td>
                    <td className="py-3 pr-4 text-white/60">{h.nextAction}</td>
                    <td className="py-3">
                      {h.epodId ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void resolve(h, "CLEARED")}
                            disabled={busyId === h.epodId}
                            className="rounded-lg bg-emerald-400/20 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-400/30 disabled:opacity-50"
                            data-testid={`clear-${h.ref}`}
                          >
                            Clear
                          </button>
                          <button
                            onClick={() => void resolve(h, "UPHELD")}
                            disabled={busyId === h.epodId}
                            className="rounded-lg bg-rose-400/20 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-400/30 disabled:opacity-50"
                            data-testid={`uphold-${h.ref}`}
                          >
                            Uphold
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40">rail desk</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TiltCard>

      {/* PROOF BOARD */}
      <TiltCard className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-sky-300" />
          <h2 className="text-lg font-semibold text-white">Proof &amp; Payments Board</h2>
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">{rows.length}</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-white/60">Nothing in motion right now.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Ref</th>
                  <th className="py-2 pr-4">Counterparty</th>
                  <th className="py-2 pr-4">Proof</th>
                  <th className="py-2 pr-4">Money</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.mode}-${r.ref}-${i}`} className="border-t border-white/5" data-testid="board-row">
                    <td className="py-2.5 pr-4"><span className="rounded bg-white/10 px-2 py-0.5 text-xs">{r.mode}</span></td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-white/80">{r.ref}</td>
                    <td className="py-2.5 pr-4 text-white/70">{r.counterparty ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs ${r.held ? "text-rose-300" : "text-emerald-300"}`}>{r.proof}</span>
                    </td>
                    <td className={`py-2.5 pr-4 text-xs ${moneyTone[r.money] ?? "text-white/70"}`}>{r.money}</td>
                    <td className="py-2.5 pr-4 text-white/90">{r.amount != null ? formatMoney(r.amount) : "—"}</td>
                    <td className="py-2.5 text-xs text-white/50">{r.holdReason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TiltCard>
    </div>
  );
}
