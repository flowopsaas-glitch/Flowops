import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, AlertTriangle, ArrowRight, Info } from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";
import { searchHsCodes, type HsCodeResult } from "../../api/publicToolsApi";

/**
 * Public HS code lookup.
 *
 * A reference set, not the tariff — and it says so on every screen. The duty
 * rate shown is indicative: the binding figure depends on the full ten-digit
 * code, preferential origin, rebate provisions and any anti-dumping duty in
 * force. Someone who quotes a client off an indicative rate without checking
 * has been failed by the tool, so the warning is not a footnote.
 *
 * Every result links into the calculator with its rate pre-filled, which is
 * the funnel: lookup -> cost -> "I should be doing this in FlowOps".
 */

export default function HsCodeLookup() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HsCodeResult[]>([]);
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const run = async (q: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await searchHsCodes(q || " ");
      setResults(r.results);
      setDisclaimer(r.disclaimer);
      setSearched(true);
    } catch {
      setError("Could not reach the lookup service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  // Show the whole reference set on first load — an empty page converts
  // nobody, and there are few enough entries to browse.
  useEffect(() => {
    void run("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = results.reduce<Record<string, HsCodeResult[]>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <PublicNav />

      <div className="pt-24 pb-16 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-300">
              <Search className="h-3.5 w-3.5" /> Free tool
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              HS code lookup for South African imports
            </h1>
            <p className="mt-3 max-w-2xl text-white/60">
              Search a starter reference set of commonly imported lines and see the
              indicative duty rate for each. Select one to carry it straight into the
              landed-cost calculator.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-white/35" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && run(query)}
                  placeholder="Try 8517, laptop, vehicles, or trousers"
                  className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none"
                />
              </div>
              <button
                onClick={() => run(query)}
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Search
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {["Electronics", "Vehicles", "Machinery", "Clothing & Textiles", "Furniture"].map(
                (c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setQuery(c);
                      void run(c);
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
                  >
                    {c}
                  </button>
                ),
              )}
            </div>

            {disclaimer && (
              <div className="mt-5 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100/90">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{disclaimer}</span>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-8">
            {Object.entries(grouped).map(([category, rows]) => (
              <section key={category}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/45">
                  {category}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                  {rows.map((r) => (
                    <Link
                      key={r.code}
                      to={`/tools/landed-cost?hs=${encodeURIComponent(r.code)}`}
                      className="flex items-start justify-between gap-4 border-b border-white/5 p-4 transition last:border-0 hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-sky-300">{r.code}</span>
                          <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold">
                            {r.indicativeRatePct}% indicative
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-white/80">{r.description}</div>
                        {r.note && (
                          <div className="mt-1.5 flex gap-1.5 text-xs text-white/45">
                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                            {r.note}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/30" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}

            {searched && results.length === 0 && !busy && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/50">
                Nothing matched “{query}”. Try a four-digit heading like{" "}
                <span className="font-mono text-sky-300">8517</span>, or a plain
                description like <span className="text-sky-300">laptop</span>.
              </div>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex-1">
              <div className="font-bold">Cost it out properly</div>
              <div className="mt-1 text-sm text-white/55">
                Carry any code into the landed-cost calculator for duty, VAT and the
                Added Tax Value breakdown.
              </div>
            </div>
            <Link
              to="/tools/landed-cost"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              Landed cost calculator <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
