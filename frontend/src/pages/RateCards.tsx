import React, {useCallback,  useEffect, useMemo, useState } from "react";
import { formatMoney } from "../lib/currency";
import { useSearchParams } from "react-router-dom";
import { Bot, CheckCircle2, Receipt, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { useToast } from "../components/toast-context";
import api from "../api/client";
const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? 'ZAR';

type RateCard = {
  id: string;
  name: string;
  companyId: string;
  clientName: string;
  baseFee: number;
  perKm: number;
  perKg: number;
  fuelSurchargePercent: number;
  vatPercent: number;
  targetMarginPercent: number;
  isActive: boolean;
  company?: { name?: string } | null;
};

type RateCardForm = {
  name: string;
  companyId: string;
  baseFee: string;
  fuelPercent: string;
  distanceRate: string;
  weightRate: string;
  marginPercent: string;
};

function unwrap<T>(r: unknown): T { return ((r as { data?: T } | null)?.data ?? r) as T; }
function unwrapList<T>(r: unknown): T[] {
  const d = (r as { data?: unknown } | null)?.data ?? r;
  if (Array.isArray(d)) return d as T[];
  const inner = (d as { data?: unknown } | null)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function money(value: number) {
  return formatMoney(Number(value || 0), tenantCurrency());
}

export default function RateCardsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [companies, setCompanies] = useState<{ id: string | number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [manualSelectedRateCardId, setSelectedRateCardId] = useState("");
  const [distanceKm, setDistanceKm] = useState("120");
  const [actualWeightKg, setActualWeightKg] = useState("8");

  const [form, setForm] = useState<RateCardForm>({
    name: "",
    companyId: "",
    baseFee: "0",
    fuelPercent: "0",
    distanceRate: "0",
    weightRate: "0",
    marginPercent: "20",
  });
  const { showToast } = useToast();

  const fetchData = useCallback(() => (async () => {
    const [cardsRaw, compRaw] = await Promise.all([
      api.get("/rate-cards"),
      api.get("/companies/my-company"),
    ]);
    const cards = unwrapList<RateCard>(cardsRaw);
    const comp  = unwrap<{ id: string | number; name: string } | null>(compRaw);
    setRateCards(cards);
    // Tenant has one company — wrap in array for the select dropdown
    setCompanies(comp && comp.id ? [comp] : []);

  })().catch((err) => {
    console.error("Fetch error", err);

  }).finally(() => {
    setLoading(false);

  }), []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // The effective selection is derived: an explicit deep-link target wins,
  // then the operator's manual choice, then the first card. No effect has to
  // copy a resolved selection into state.
  const requestedRateCardId = searchParams.get("rateCardId");
  const requestedCompanyId = searchParams.get("companyId");
  const requestedClientName = searchParams.get("clientName")?.toLowerCase();
  const requestedRateCard = rateCards.find((card) => {
    if (requestedRateCardId && card.id === requestedRateCardId) return true;
    if (requestedCompanyId && String(card.companyId) === requestedCompanyId) return true;
    if (requestedClientName && String(card.clientName || "").toLowerCase() === requestedClientName) return true;
    return false;
  });
  const selectedRateCardId = requestedRateCard?.id
    ?? (rateCards.some((card) => card.id === manualSelectedRateCardId) ? manualSelectedRateCardId : rateCards[0]?.id ?? "");

  useEffect(() => {
    if (!selectedRateCardId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("rateCardId", selectedRateCardId);
      return next;
    });
  }, [selectedRateCardId, setSearchParams]);

  const selectedRateCard = useMemo(
    () => rateCards.find((c) => c.id === selectedRateCardId) || null,
    [rateCards, selectedRateCardId]
  );

  const simulation = useMemo(() => {
    if (!selectedRateCard) return null;
    const dist = Number(distanceKm) || 0;
    const weight = Number(actualWeightKg) || 0;
    const base = Number(selectedRateCard.baseFee) || 0;
    const subtotal = base + dist * selectedRateCard.perKm + weight * selectedRateCard.perKg;
    const fuel = subtotal * (selectedRateCard.fuelSurchargePercent / 100);
    const totalExVat = subtotal + fuel;
    const vat = selectedRateCard.vatPercent || 15;
    const total = totalExVat * (1 + vat / 100);

    return {
      subtotal,
      fuel,
      total,
      margin: selectedRateCard.targetMarginPercent,
    };
  }, [selectedRateCard, distanceKm, actualWeightKg]);

  const aiReview = useMemo(() => {
    const source = showEditor
      ? {
          name: form.name,
          companyId: form.companyId,
          baseFee: Number(form.baseFee || 0),
          perKm: Number(form.distanceRate || 0),
          perKg: Number(form.weightRate || 0),
          fuelSurchargePercent: Number(form.fuelPercent || 0),
          targetMarginPercent: Number(form.marginPercent || 0),
          vatPercent: 15,
        }
      : selectedRateCard
        ? {
            name: selectedRateCard.name,
            companyId: selectedRateCard.companyId,
            baseFee: Number(selectedRateCard.baseFee || 0),
            perKm: Number(selectedRateCard.perKm || 0),
            perKg: Number(selectedRateCard.perKg || 0),
            fuelSurchargePercent: Number(selectedRateCard.fuelSurchargePercent || 0),
            targetMarginPercent: Number(selectedRateCard.targetMarginPercent || 0),
            vatPercent: Number(selectedRateCard.vatPercent || 15),
          }
        : null;

    if (!source) return null;

    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!String(source.name || "").trim()) blockingIssues.push("Rate card profile name is missing.");
    if (!String(source.companyId || "").trim()) blockingIssues.push("Client / company selection is missing.");
    if (source.baseFee <= 0) blockingIssues.push("Base fee must be greater than zero.");
    if (source.perKm <= 0 && source.perKg <= 0) {
      blockingIssues.push("At least one variable pricing driver is required: per-km or per-kg.");
    }

    if (source.targetMarginPercent < 10) warnings.push("Target margin is low and may underprice your operation.");
    if (source.targetMarginPercent > 60) warnings.push("Target margin is very high and may reduce win-rate on quotes.");
    if (source.fuelSurchargePercent > 35) warnings.push("Fuel surcharge is unusually high. Confirm this against your contracts.");
    if (source.vatPercent <= 0) warnings.push("VAT is zero. Make sure zero VAT is intended.");

    if (!blockingIssues.length) {
      suggestions.push("This rate card looks structurally usable for quoting and invoice pricing.");
    }
    if (source.perKm <= 0) suggestions.push("Consider adding a per-km rate so long-haul work prices more accurately.");
    if (source.perKg <= 0) suggestions.push("Consider adding a per-kg rate if heavy shipments materially change cost.");
    if (source.targetMarginPercent < 20) suggestions.push("Review margin target against current fuel, driver, and branch costs.");

    const completenessScore = Math.max(
      0,
      Math.min(100, 100 - blockingIssues.length * 24 - warnings.length * 8 + (source.companyId ? 6 : 0))
    );

    return {
      completenessScore,
      ready: blockingIssues.length === 0,
      confidence: completenessScore >= 90 ? "HIGH" : completenessScore >= 70 ? "MEDIUM" : "LOW",
      blockingIssues,
      warnings,
      suggestions,
    };
  }, [form, selectedRateCard, showEditor]);

  async function handleSave() {
    try {
      await api.post("/rate-cards", {
        ...form,
        baseFee: Number(form.baseFee),
        fuelSurchargePercent: Number(form.fuelPercent),
        perKm: Number(form.distanceRate),
        perKg: Number(form.weightRate),
        targetMarginPercent: Number(form.marginPercent),
        vatPercent: 15,
        isActive: true,
      });
      setShowEditor(false);
      await fetchData();
    } catch {
      showToast("Save failed", "error");
    }
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(55,90,180,0.18),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8">
      <div className="mx-auto max-w-[1650px] space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
                <Sparkles className="h-4 w-4" />
                FlowOps Pricing Guardrail
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Commercial Pricing
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-white/72">
                Rate card engine, profitability simulator, and Z AI review for quote and invoice safety.
              </p>
            </div>

            <button
              onClick={() => setShowEditor(true)}
              className="rounded-2xl bg-sky-500 px-8 py-3 font-bold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400"
            >
              + New Rate Card
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            {searchParams.get("companyId") || searchParams.get("clientName") || searchParams.get("waybillNumber") ? (
              <div className="rounded-[24px] border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                Pricing context linked from{" "}
                {searchParams.get("clientName")
                  ? `client ${searchParams.get("clientName")}`
                  : searchParams.get("waybillNumber")
                    ? `waybill ${searchParams.get("waybillNumber")}`
                    : `company ${searchParams.get("companyId")}`}.
              </div>
            ) : null}
            {showEditor ? (
              <div className="rounded-[24px] border border-sky-500/30 bg-slate-900 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
                <h2 className="text-xl font-bold text-white">Create Pricing Profile</h2>
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <input placeholder="Profile Name" className={editorInput()} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <select className={editorInput()} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                    <option value="">-- Select Client --</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" placeholder="Base Fee (R)" className={editorInput()} onChange={(e) => setForm({ ...form, baseFee: e.target.value })} />
                  <input type="number" placeholder="Distance Rate (R/Km)" className={editorInput()} onChange={(e) => setForm({ ...form, distanceRate: e.target.value })} />
                  <input type="number" placeholder="Weight Rate (R/Kg)" className={editorInput()} onChange={(e) => setForm({ ...form, weightRate: e.target.value })} />
                  <input type="number" placeholder="Fuel %" className={editorInput()} onChange={(e) => setForm({ ...form, fuelPercent: e.target.value })} />
                  <input type="number" placeholder="Target Margin %" className={editorInput()} onChange={(e) => setForm({ ...form, marginPercent: e.target.value })} />
                </div>
                <div className="mt-8 flex justify-end gap-4">
                  <button onClick={() => setShowEditor(false)} className="px-6 font-bold text-slate-500">
                    Cancel
                  </button>
                  <button onClick={handleSave} className="rounded-2xl bg-sky-500 px-8 py-3 font-bold text-white">
                    Save Profile
                  </button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/40 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="p-6">Profile</th>
                    <th className="p-6">Client</th>
                    <th className="p-6">Base Fee</th>
                    <th className="p-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rateCards.map((card) => (
                    <tr key={card.id} className="transition-colors hover:bg-white/5">
                      <td className="p-6 font-bold text-white">{card.name}</td>
                      <td className="p-6 text-slate-400">{card.company?.name || "General"}</td>
                      <td className="p-6 font-mono text-sky-400">{money(Number(card.baseFee))}</td>
                      <td className="p-6">
                        <button onClick={() => setSelectedRateCardId(card.id)} className="text-xs font-black uppercase text-sky-500 hover:text-sky-300">
                          Simulate
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && rateCards.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-sm text-white/60">
                        No rate cards found yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-slate-900 p-8 shadow-2xl">
              <h2 className="mb-6 text-center text-lg font-bold uppercase tracking-widest text-sky-400">
                Profitability Simulator
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase text-slate-500" htmlFor="field-distance-km-2">Distance (Km)</label>
                  <input id="field-distance-km-2" type="number" className={editorInput()} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase text-slate-500" htmlFor="field-weight-kg-1">Weight (Kg)</label>
                  <input id="field-weight-kg-1" type="number" className={editorInput()} value={actualWeightKg} onChange={(e) => setActualWeightKg(e.target.value)} />
                </div>

                {simulation ? (
                  <div className="mt-8 border-t border-white/5 pt-8 text-center">
                    <div className="mb-1 text-[10px] font-black uppercase text-slate-500">Estimated Quote</div>
                    <div className="text-5xl font-black tracking-tighter text-white">{money(simulation.total)}</div>
                    <div className="mt-4 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-tighter text-emerald-400">
                      Target Margin: {simulation.margin}%
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
                    Select a rate card to run a quote simulation.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.30)] backdrop-blur-2xl">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Bot className="h-5 w-5" />
                Z AI Rate Card Review
              </div>
              <div className="mt-1 text-sm text-white/70">
                Preflight pricing guardrail for structure, margin sanity, and invoice safety.
              </div>

              {aiReview ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[180px_1fr]">
                  <div className="rounded-[22px] border border-sky-500/20 bg-sky-500/10 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Completeness</div>
                    <div className="mt-2 text-4xl font-black text-white">{aiReview.completenessScore}</div>
                    <div
                      className={cn(
                        "mt-3 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase",
                        aiReview.ready ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                      )}
                    >
                      {aiReview.ready ? "Ready for Pricing" : "Needs Review"}
                    </div>
                    <div className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-white/50">
                      Confidence: {aiReview.confidence}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <AssistListCard
                      title="Blocking Issues"
                      tone={aiReview.blockingIssues.length ? "amber" : "emerald"}
                      icon={ShieldAlert}
                      items={aiReview.blockingIssues.length ? aiReview.blockingIssues : ["No blocking issues detected."]}
                    />
                    <AssistListCard
                      title="Warnings"
                      tone="slate"
                      icon={Receipt}
                      items={aiReview.warnings.length ? aiReview.warnings : ["No pricing warnings detected."]}
                    />
                    <AssistListCard
                      title="Suggestions"
                      tone="sky"
                      icon={TrendingUp}
                      items={aiReview.suggestions.length ? aiReview.suggestions : ["No extra suggestions from Z AI."]}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/70">
                  Open a rate card or start creating one to get Z AI pricing review.
                </div>
              )}
            </div>

            {selectedRateCard ? (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.30)] backdrop-blur-2xl">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <CheckCircle2 className="h-5 w-5" />
                  Active Pricing Profile
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Meta label="Profile" value={selectedRateCard.name} />
                  <Meta label="Client" value={selectedRateCard.company?.name || selectedRateCard.clientName || "General"} />
                  <Meta label="Base Fee" value={money(selectedRateCard.baseFee)} />
                  <Meta label="Per Km" value={money(selectedRateCard.perKm)} />
                  <Meta label="Per Kg" value={money(selectedRateCard.perKg)} />
                  <Meta label="Fuel %" value={`${selectedRateCard.fuelSurchargePercent}%`} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function editorInput() {
  return "w-full rounded-2xl border border-white/5 bg-slate-800 p-4 text-white outline-none focus:border-sky-500";
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-1 text-xs font-semibold text-white/80">{value}</div>
    </div>
  );
}

function AssistListCard({
  title,
  items,
  tone,
  icon: Icon,
}: {
  title: string;
  items: string[];
  tone: "amber" | "emerald" | "sky" | "slate";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-500/20 bg-amber-500/10"
      : tone === "emerald"
        ? "border-emerald-500/20 bg-emerald-500/10"
        : tone === "sky"
          ? "border-sky-500/20 bg-sky-500/10"
          : "border-white/10 bg-white/5";

  return (
    <div className={cn("rounded-[22px] border p-4", toneClasses)}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="text-sm text-white/85">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
