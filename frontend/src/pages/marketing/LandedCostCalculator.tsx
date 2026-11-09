import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calculator, Info, Search, AlertTriangle, ArrowRight } from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";
import {
  estimateImportDuty,
  searchHsCodes,
  type DutyEstimate,
  type HsCodeResult,
} from "../../api/publicToolsApi";

/**
 * Public landed-cost calculator.
 *
 * Free, unauthenticated, and aimed at the person who types "south africa
 * import duty calculator" at 11pm. It is the top of the funnel, so the two
 * things it must never do are:
 *
 *   - overstate certainty (every result carries the disclaimer), and
 *   - disagree with the figure the same person sees once they are a paying
 *     client (the arithmetic is the shared sa-import-duty module, not a
 *     re-implementation).
 */

const zar = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

export default function LandedCostCalculator() {
  const [params] = useSearchParams();
  const [customsValue, setCustomsValue] = useState("100000");
  const [dutyRate, setDutyRate] = useState("0");
  const [hsQuery, setHsQuery] = useState("");
  const [hsResults, setHsResults] = useState<HsCodeResult[]>([]);
  const [picked, setPicked] = useState<HsCodeResult | null>(null);
  const [result, setResult] = useState<DutyEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await searchHsCodes(hsQuery || " ");
      setHsResults(r.results);
    } catch {
      setError("Could not reach the HS code service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (code: HsCodeResult) => {
    setPicked(code);
    setDutyRate(String(code.indicativeRatePct));
    setHsResults([]);
    setHsQuery("");
  };

  // Arriving from the HS lookup with ?hs=8517.12 — resolve it to a real entry
  // rather than trusting the query string, so a hand-edited or stale code
  // cannot put a rate on screen that our reference set does not actually hold.
  useEffect(() => {
    const hs = params.get("hs");
    if (!hs) return;
    let cancelled = false;
    void searchHsCodes(hs)
      .then((r) => {
        if (cancelled) return;
        const exact = r.results.find((x) => x.code === hs) ?? r.results[0];
        if (exact) pick(exact);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [params]);

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await estimateImportDuty([
        {
          customsValue: Number(customsValue) || 0,
          // An explicitly typed rate always wins: a professional who has
          // confirmed the real line must be able to override our suggestion.
          dutyRatePct: Number(dutyRate) || 0,
          hsCode: picked?.code,
          description: picked?.description,
        },
      ]);
      setResult(r);
    } catch {
      setError("Could not reach the calculator service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const line = result?.lines?.[0];
  const uplift = useMemo(() => (Number(customsValue) || 0) * 0.1, [customsValue]);

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <PublicNav />

      <div className="pt-24 pb-16 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-300">
              <Calculator className="h-3.5 w-3.5" /> Free tool
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              South African import duty &amp; landed cost calculator
            </h1>
            <p className="mt-3 max-w-2xl text-white/60">
              Estimate duty and VAT on goods imported into South Africa, using the same
              Added Tax Value basis SARS applies — VAT is charged on the customs value
              <em> plus a 10% upliftment plus duty</em>, not on the bare invoice value.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* ── Inputs ─────────────────────────────────────────────── */}
            <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <label htmlFor="hs-query" className="block text-sm font-semibold text-white/80">
                HS code (optional — pre-fills the duty rate)
              </label>
              <div className="mt-2 flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-white/35" />
                  <input
                    value={hsQuery}
                    onChange={(e) => setHsQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search()}
                    id="hs-query"
                    placeholder="Try 8517, laptop, or trousers"
                    className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none"
                  />
                </div>
                <button
                  onClick={search}
                  disabled={busy}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
                >
                  Search
                </button>
              </div>

              {hsResults.length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/40">
                  {hsResults.map((r) => (
                    <button
                      key={r.code}
                      onClick={() => pick(r)}
                      className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-white/5"
                    >
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-sky-300">{r.code}</span>{" "}
                        <span className="truncate text-white/80">{r.description}</span>
                      </span>
                      <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold">
                        {r.indicativeRatePct}%
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {picked && (
                <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-500/10 p-3 text-sm">
                  <div className="font-semibold text-sky-200">
                    {picked.code} — {picked.description}
                  </div>
                  {picked.note && <div className="mt-1 text-xs text-white/60">{picked.note}</div>}
                  <button
                    onClick={() => setPicked(null)}
                    className="mt-2 text-xs font-semibold text-sky-300 underline underline-offset-2"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="customs-value" className="block text-sm font-semibold text-white/80">
                    Customs value (ZAR)
                  </label>
                  <input
                    value={customsValue}
                    onChange={(e) => setCustomsValue(e.target.value)}
                    id="customs-value"
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:border-sky-400/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="duty-rate" className="block text-sm font-semibold text-white/80">
                    Duty rate (%)
                  </label>
                  <input
                    id="duty-rate"
                    value={dutyRate}
                    onChange={(e) => setDutyRate(e.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:border-sky-400/50 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-white/40">
                    Override this once you have confirmed the real line.
                  </p>
                </div>
              </div>

              <button
                onClick={calculate}
                disabled={busy}
                className="mt-6 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
              >
                {busy ? "Calculating…" : "Calculate duty & VAT"}
              </button>

              {error && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* ── Result ─────────────────────────────────────────────── */}
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/50">
                Estimate
              </h2>

              {!line ? (
                <p className="mt-6 text-sm text-white/45">
                  Enter a value and press calculate. The breakdown shows the Added Tax
                  Value, so you can see exactly what the VAT is charged on.
                </p>
              ) : (
                <dl className="mt-4 space-y-3 text-sm">
                  <Row label="Customs value" value={zar(line.customsValue)} />
                  <Row label={`Duty (${line.dutyRatePct}%)`} value={zar(line.duty)} />
                  <Row
                    label={`10% upliftment`}
                    value={zar(uplift)}
                    hint="Applied to imports before VAT"
                  />
                  <div className="border-t border-white/10 pt-3">
                    <Row label="Added Tax Value (ATV)" value={zar(line.atv)} strong />
                  </div>
                  <Row label="VAT (15% of ATV)" value={zar(line.vat)} />
                  <div className="border-t border-white/10 pt-3">
                    <Row label="Total duty + VAT" value={zar(line.totalPayable)} strong />
                  </div>
                </dl>
              )}

              {result && (
                <div className="mt-5 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100/90">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{result.disclaimer}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex-1">
              <div className="font-bold">Need the HS code?</div>
              <div className="mt-1 text-sm text-white/55">
                Browse the reference set, or model this across a whole shipment inside
                FlowOps with customs declarations, EDIs and per-line duty.
              </div>
            </div>
            <Link
              to="/tools/hs-codes"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              HS code lookup <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-white/60">
        {label}
        {hint && <span className="block text-xs text-white/35">{hint}</span>}
      </dt>
      <dd className={strong ? "text-base font-black" : "font-semibold"}>{value}</dd>
    </div>
  );
}
