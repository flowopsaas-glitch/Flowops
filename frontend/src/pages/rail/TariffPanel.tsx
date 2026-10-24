import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import {
  calculateTariff, generateInvoiceDraft, getAncillaryServices, getTariffStatus, listCalculations, previewTariff,
  type AncillaryService, type HoldDecision, type SavedCalculation, type TariffPreview, type TariffResult, type TariffStatusResponse,
} from "../../api/railTariffApi";
import { listConsignments, type RailConsignment } from "../../api/railApi";
import {
  LINE_KIND_LABEL, PRICE_STATUS_LABEL, TARIFF_STATUS_LABEL, buildTariffRequest, canGenerateInvoiceDraft, emptyTariffForm, fmtNum, fmtQuantity, fmtRate,
  groupAncillary, invoiceDraftNote, lineAmountText, priceStatusTone, tariffFormErrors, tariffFormKey, tariffStatusTone, unpricedLineCount, zar,
  type TariffFormState,
} from "../../lib/railTariff";
import { useToast } from "../../components/toast-context";
import { Banner, Field, Modal, Pill, Section, btnNeutral, btnPrimary, btnWarn, inputCls } from "./railUi";

/** What a result view needs; both a fresh calculation and a saved one can supply it. */
type ResultLike = Pick<TariffResult, "status" | "lines" | "blockers" | "warnings" | "subtotalZar" | "gtkLoaded" | "gtkEmpty">
  & Partial<Pick<TariffResult, "scheduleFinancialYear" | "escalationYears" | "weightSources">> & { hold?: HoldDecision };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

/**
 * Tariff calculator + saved calculations + one-click invoice draft (RAIL-013).
 *
 * Every rate, quantity, amount, overload verdict and hold shown here was worked out by the SERVER from stored data. The browser
 * sends only what the user knows (the distance, litres / kWh, ancillary quantities) and never a rate. A corridor with no VERIFIED
 * c/GTK rate is refused with its reasons; a line with no rate is "Not priced" (never R0.00); and an incomplete calculation can be
 * saved but never invoiced.
 */
export default function TariffPanel({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<TariffStatusResponse | null>(null);
  const [ancillary, setAncillary] = useState<AncillaryService[]>([]);
  const [consignments, setConsignments] = useState<RailConsignment[]>([]);
  const [calcs, setCalcs] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<TariffFormState>(emptyTariffForm());
  const [attempted, setAttempted] = useState(false);
  const [preview, setPreview] = useState<{ key: string; data: TariffPreview } | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<SavedCalculation | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const [clientFor, setClientFor] = useState<SavedCalculation | null>(null);

  const load = useCallback(() => (async () => {
    const [s, a, c, k] = await Promise.all([
      getTariffStatus(), getAncillaryServices(), listConsignments(), listCalculations(),
    ]);
    setStatus(s);
    setAncillary(a);
    setConsignments(c);
    setCalcs(k);
    setLoadError(null);

  })().catch((e) => {
    const message = String((e as Error)?.message ?? e);
    setStatus(null);
    setAncillary([]);
    setConsignments([]);
    setCalcs([]);
    setLoadError(message);
    showToast(`Could not load tariff data: ${message}`, "error");

  }).finally(() => {
    setLoading(false);

  }), [showToast]);

  useEffect(() => { void load(); }, [load]);

  const errors = useMemo(() => tariffFormErrors(form), [form]);
  const key = tariffFormKey(form);
  const stale = !!preview && preview.key !== key;
  const set = <K extends keyof TariffFormState>(k: K, v: TariffFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  /** Format errors show as the user types; "required" ones only after the first attempt. */
  const err = (k: keyof typeof errors, value: string) => (attempted || value.trim() !== "" ? errors[k] : undefined);
  const groups = useMemo(() => groupAncillary(ancillary, query), [ancillary, query]);
  const chosen = new Set(form.ancillary.map((a) => a.code));

  async function runPreview() {
    setAttempted(true);
    if (Object.keys(errors).length) return;
    setBusy("preview");
    try {
      setPreview({ key, data: await previewTariff(buildTariffRequest(form)) });
    } catch (e) {
      showToast((e as Error)?.message || "Could not calculate", "error");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!preview || stale || preview.data.result.status === "BLOCKED") return;
    setBusy("save");
    try {
      const r = await calculateTariff(buildTariffRequest(form));
      showToast(`${r.calculation.calculationNumber} saved — ${TARIFF_STATUS_LABEL[r.calculation.status]}`, "success");
      setPreview({ key, data: { consignment: r.consignment, corridor: r.corridor, financialYear: r.financialYear, result: r.result, constants: r.constants } });
      setCalcs(await listCalculations());
    } catch (e) {
      showToast((e as Error)?.message || "Could not save the calculation", "error");
    } finally {
      setBusy(null);
    }
  }

  async function makeDraft(calc: SavedCalculation, clientName?: string) {
    setInvoiceBusy(calc.id);
    try {
      const r = await generateInvoiceDraft(calc.id, clientName ? { clientName } : {});
      showToast(r.created ? "Invoice draft created — review it under Billing → Invoice Drafts" : "A draft already existed for this calculation — nothing new was created", "success");
      setClientFor(null);
      setCalcs(await listCalculations());
      setViewing((v) => (v && v.id === calc.id ? null : v));
    } catch (e) {
      const m = (e as Error)?.message || "Could not create the invoice draft";
      if (/client name is required/i.test(m)) setClientFor(calc); else showToast(m, "error");
    } finally {
      setInvoiceBusy(null);
    }
  }

  function onGenerate(calc: SavedCalculation) {
    const c = consignments.find((x) => x.id === calc.consignmentId);
    // Only ask when we KNOW the consignment has no client; otherwise let the server decide (an entered name would override the stored one).
    if (c && !c.clientName?.trim()) setClientFor(calc); else void makeDraft(calc);
  }

  if (loading && !status) {
    return <div className="flex items-center gap-2 py-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const sum = status?.summary;
  const bookable = consignments.filter((c) => c.status !== "CANCELLED");
  const canSave = canWrite && !!preview && !stale && preview.data.result.status !== "BLOCKED" && busy === null;

  return (
    <div data-testid="tariff-panel">
      {loadError && (
        <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
          Tariff data unavailable: {loadError}. No rates, catalogue entries, consignments, or saved calculations can be verified.{" "}
          <button type="button" onClick={() => void load()} className="underline underline-offset-2">Retry</button>
        </div>
      )}
      {status && (
        <Banner tone={sum && sum.withVerifiedRate > 0 ? "warn" : "danger"} title={sum && sum.withVerifiedRate === 0 ? "No corridor has a VERIFIED c/GTK rate loaded — nothing can be priced yet" : `${sum?.withVerifiedRate} of ${sum?.corridors} corridors have a VERIFIED loaded rate`}>
          {status.message}
        </Banner>
      )}

      {status && sum && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Corridors with a verified rate</div>
            <div className="mt-2 text-2xl font-black text-white">{sum.withVerifiedRate} <span className="text-base font-semibold text-slate-500">/ {sum.corridors}</span></div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Annexure 40 ancillary lines</div>
            <div className="mt-2 text-2xl font-black text-white">{sum.ancillaryLines}</div>
            <div className="mt-1 text-xs text-slate-400">{sum.ancillaryPublished} published · {sum.ancillaryTbd} TBD · {sum.ancillaryNotPublished} with no price published</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" data-testid="tariff-constants">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Constants from the brief <span className="text-amber-300">(unverified)</span></div>
            <div className="mt-2 text-xs text-slate-300">Infrastructure escalation <b>{status.constants.infrastructureEscalationPct.toFixed(2)}%</b> · electricity <b>{status.constants.electricityEscalationPct.toFixed(2)}%</b> · diesel base <b>R{status.constants.dieselBasePricePerLitreZar.toFixed(2)}/L</b></div>
            <div className="mt-1 text-[11px] text-slate-500">{status.constants.source}. Escalation is applied only when you tick it.</div>
          </div>
        </div>
      )}

      {/* ── calculator ─────────────────────────────────────────────────── */}
      <Section title="Tariff calculator" right={<button className={btnNeutral} onClick={() => void load()}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>}>
        <p className="mb-3 text-xs text-slate-400">Gross tonnes (weighbridge mass where there is one, otherwise registered tare + loaded) × distance gives GTK; the server prices it from the corridor's loaded rate, then adds traction energy, ancillary services and any overload penalty. A rate is never assumed.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Consignment *">
            <select className={inputCls} value={form.consignmentId} onChange={(e) => set("consignmentId", e.target.value)} aria-label="Consignment">
              <option value="">Select a consignment</option>
              {bookable.map((c) => <option key={c.id} value={c.id}>{c.consignmentNumber} · {c.commodity} · {c.corridor ?? "no corridor"}</option>)}
            </select>
            {err("consignmentId", form.consignmentId) && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.consignmentId}</span>}
          </Field>
          <Field label="Distance (km) *">
            <input className={inputCls} inputMode="decimal" value={form.distanceKm} onChange={(e) => set("distanceKm", e.target.value)} aria-label="Distance in km" placeholder="e.g. 850" />
            <span className="mt-1 block text-[11px] text-slate-500">Corridor lengths were not supplied, so the distance is entered by hand.</span>
            {err("distanceKm", form.distanceKm) && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.distanceKm}</span>}
          </Field>
          <Field label="Financial year">
            <input className={inputCls} value={form.financialYear} onChange={(e) => set("financialYear", e.target.value)} aria-label="Financial year" placeholder="2026/27 — blank uses the planned departure" />
            {err("financialYear", form.financialYear) && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.financialYear}</span>}
          </Field>
          <Field label="Traction energy">
            <select className={inputCls} value={form.traction} onChange={(e) => set("traction", e.target.value as TariffFormState["traction"])} aria-label="Traction energy">
              <option value="NONE">Not included</option><option value="DIESEL">Diesel</option><option value="ELECTRIC">Electric</option>
            </select>
          </Field>
          {form.traction === "DIESEL" && (
            <Field label="Litres (blank = from the loaded consumption factor)">
              <input className={inputCls} inputMode="decimal" value={form.litres} onChange={(e) => set("litres", e.target.value)} aria-label="Litres" />
              {err("litres", form.litres) && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.litres}</span>}
            </Field>
          )}
          {form.traction === "ELECTRIC" && (
            <Field label="kWh (blank = from the loaded consumption factor)">
              <input className={inputCls} inputMode="decimal" value={form.kWh} onChange={(e) => set("kWh", e.target.value)} aria-label="kWh" />
              {err("kWh", form.kWh) && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.kWh}</span>}
            </Field>
          )}
          {form.traction !== "NONE" && (
            <Field label={form.traction === "DIESEL" ? "Price per litre (R) — blank uses the loaded price, else the brief's base" : "Price per kWh (R) — blank uses the loaded price (none loaded ⇒ not priced)"}>
              <input className={inputCls} inputMode="decimal" value={form.pricePerUnit} onChange={(e) => set("pricePerUnit", e.target.value)} aria-label="Price per unit" />
              {err("pricePerUnit", form.pricePerUnit) && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.pricePerUnit}</span>}
            </Field>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-200">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.includeEmptyReturn} onChange={(e) => set("includeEmptyReturn", e.target.checked)} /> Include the empty return</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.allowEscalation} onChange={(e) => set("allowEscalation", e.target.checked)} /> Escalate an earlier year's rate if this year has none (brief's 8.50% / 4.42%, unverified)</label>
        </div>

        {/* Annexure 40 */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">Ancillary services (Annexure 40)</h3>
            <input className={`${inputCls} max-w-xs`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter the 113 lines…" aria-label="Filter ancillary services" />
          </div>
          {form.ancillary.length > 0 && (
            <ul className="mb-3 space-y-1.5" aria-label="Selected ancillary services">
              {form.ancillary.map((a) => {
                const svc = ancillary.find((s) => s.code === a.code);
                return (
                  <li key={a.code} className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-sm">
                    <span className="font-mono text-xs text-emerald-300">{a.code}</span>
                    <span className="text-slate-200">{svc?.name ?? ""}</span>
                    {svc && <Pill tone={priceStatusTone(svc.priceStatus)}>{PRICE_STATUS_LABEL[svc.priceStatus]}</Pill>}
                    <input className={`${inputCls} ml-auto w-28`} inputMode="decimal" value={a.quantity} aria-label={`Quantity for ${a.code}`} placeholder={svc?.unitOfMeasure ?? "qty"}
                      onChange={(e) => setForm((f) => ({ ...f, ancillary: f.ancillary.map((x) => (x.code === a.code ? { ...x, quantity: e.target.value } : x)) }))} />
                    <button className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={`Remove ${a.code}`} onClick={() => setForm((f) => ({ ...f, ancillary: f.ancillary.filter((x) => x.code !== a.code) }))}><X className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
          {errors.ancillary && attempted && <p role="alert" className="mb-2 text-[11px] text-rose-300">{errors.ancillary}</p>}
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1" data-testid="ancillary-list">
            {groups.length === 0 && <p className="text-xs text-slate-500">{ancillary.length === 0 ? "The Annexure 40 catalogue is not available." : "No line matches that filter."}</p>}
            {groups.map((g) => (
              <div key={g.serviceNumber}>
                <div className="text-[11px] font-semibold text-slate-400">{g.serviceNumber}. {g.serviceName} <span className="font-normal text-slate-600">· {g.tierName}</span></div>
                {g.lines.map((l) => (
                  <div key={l.code} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className="w-24 shrink-0 font-mono text-slate-500">{l.code}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={l.description ?? l.name}>{l.name} <span className="text-slate-600">({l.unitOfMeasure})</span></span>
                    <Pill tone={priceStatusTone(l.priceStatus)}>{PRICE_STATUS_LABEL[l.priceStatus]}</Pill>
                    <button className={btnNeutral} disabled={chosen.has(l.code) || form.ancillary.length >= 50} aria-label={`Add ${l.code}`}
                      onClick={() => setForm((f) => ({ ...f, ancillary: [...f.ancillary, { code: l.code, quantity: "1" }] }))}><Plus className="h-3 w-3" /> {chosen.has(l.code) ? "Added" : "Add"}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={btnPrimary} onClick={() => void runPreview()} disabled={busy !== null}>{busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Calculate</button>
          {canWrite && (
            <button className={btnNeutral} onClick={() => void save()} disabled={!canSave} title={canSave ? undefined : "Calculate first — a calculation that cannot be priced at all is never saved"}>
              {busy === "save" ? "Saving…" : "Save calculation"}
            </button>
          )}
          {stale && <span role="status" className="text-xs text-amber-300">The inputs changed after this result — calculate again.</span>}
        </div>

        {preview && (
          <div className={`mt-4 ${stale ? "opacity-50" : ""}`} data-testid="tariff-result">
            <div className="mb-2 text-xs text-slate-400">
              {preview.data.consignment.consignmentNumber} · {preview.data.corridor ? `${preview.data.corridor.name} (${preview.data.corridor.code})` : "corridor not in the catalogue"} · financial year {preview.data.financialYear}
            </div>
            <ResultView result={preview.data.result} />
          </div>
        )}
      </Section>

      {/* ── saved calculations ─────────────────────────────────────────── */}
      <Section title="Saved calculations">
        {calcs.length === 0 && loadError ? null : calcs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No calculations saved yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm" aria-label="Saved calculations">
              <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr><th className="px-3 py-2">Calculation</th><th className="px-3 py-2">Consignment</th><th className="px-3 py-2">Corridor · year</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Priced lines</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {calcs.map((c) => {
                  const note = invoiceDraftNote(c);
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2.5 font-mono font-semibold text-emerald-400">{c.calculationNumber}<div className="font-sans text-[11px] font-normal text-slate-500">{fmtDate(c.createdAt)}{c.holdTriggered ? " · overload" : ""}</div></td>
                      <td className="px-3 py-2.5 text-slate-300">{c.consignmentNumber}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{c.corridorCode} · {c.financialYear}</td>
                      <td className="px-3 py-2.5"><Pill tone={tariffStatusTone(c.status)}>{TARIFF_STATUS_LABEL[c.status]}</Pill></td>
                      <td className="px-3 py-2.5 text-right text-slate-200">{zar(c.subtotalZar)}{unpricedLineCount(c.lines) > 0 && <div className="text-[11px] text-amber-300">+ {unpricedLineCount(c.lines)} not priced</div>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{c.invoiceDraftId ? <Pill tone="info">Draft created</Pill> : note ? <span title={note}>—</span> : "—"}</td>
                      <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1.5">
                        <button className={btnNeutral} onClick={() => setViewing(c)} aria-label={`View ${c.calculationNumber}`}>View</button>
                        {canGenerateInvoiceDraft(c, canWrite) && (
                          <button className={btnPrimary} disabled={invoiceBusy === c.id} onClick={() => onGenerate(c)} aria-label={`Generate invoice draft for ${c.calculationNumber}`}>
                            {invoiceBusy === c.id ? "Creating…" : "Generate Invoice Draft"}
                          </button>
                        )}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {viewing && (
        <Modal title={`${viewing.calculationNumber} — ${viewing.consignmentNumber}`} onClose={() => setViewing(null)} wide>
          <div className="mb-2 text-xs text-slate-400">{viewing.corridorCode} · financial year {viewing.financialYear} · calculated {fmtDate(viewing.createdAt)}</div>
          {viewing.holdTriggered && <Banner tone="danger" title="An overloaded wagon was on this consignment when it was calculated">The overload penalty line is part of this calculation.</Banner>}
          <ResultView result={viewing} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400" data-testid="invoice-note">{invoiceDraftNote(viewing) ?? "Ready to become an invoice draft."}</span>
            <div className="flex gap-2">
              <button className={btnNeutral} onClick={() => setViewing(null)}>Close</button>
              {canGenerateInvoiceDraft(viewing, canWrite) && <button className={btnPrimary} disabled={invoiceBusy === viewing.id} onClick={() => onGenerate(viewing)}>Generate Invoice Draft</button>}
            </div>
          </div>
        </Modal>
      )}

      {clientFor && <ClientNameModal calc={clientFor} busy={invoiceBusy === clientFor.id} onClose={() => setClientFor(null)} onDone={(name) => void makeDraft(clientFor, name)} />}
    </div>
  );
}

// ── the result of a calculation ───────────────────────────────────────────────

function ResultView({ result }: { result: ResultLike }) {
  const unpriced = unpricedLineCount(result.lines);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pill tone={tariffStatusTone(result.status)}>{TARIFF_STATUS_LABEL[result.status]}</Pill>
        {result.gtkLoaded != null && <span className="text-xs text-slate-400">{fmtNum(result.gtkLoaded)} GTK loaded{result.gtkEmpty != null ? ` · ${fmtNum(result.gtkEmpty)} GTK empty` : ""}</span>}
        {result.scheduleFinancialYear && <span className="text-xs text-slate-400">rates from {result.scheduleFinancialYear}{(result.escalationYears ?? 0) > 0 ? `, escalated ${result.escalationYears} year(s)` : ""}</span>}
      </div>

      {result.status === "BLOCKED" && (
        <Banner tone="danger" title="This consignment cannot be priced">
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{result.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="mt-2 opacity-80">Nothing was priced, and nothing is saved from a refusal. No rate is ever assumed.</p>
        </Banner>
      )}
      {result.status === "INCOMPLETE" && (
        <Banner tone="warn" title={`${unpriced} line(s) have no rate — this is not an invoice total`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{result.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="mt-2 opacity-80">It can be saved, but no invoice draft can be made until every line is priced.</p>
        </Banner>
      )}
      {result.hold?.held && (
        <Banner tone="danger" title="Overload — the consignment is held for load adjustment">
          {result.hold.reason}
        </Banner>
      )}

      {result.lines.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm" aria-label="Tariff lines">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr><th className="px-3 py-2">Charge</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {result.lines.map((l, i) => (
                <tr key={`${l.kind}-${l.code ?? i}`}>
                  <td className="px-3 py-2.5"><div className="font-semibold text-white">{l.description}</div><div className="text-[11px] text-slate-500">{LINE_KIND_LABEL[l.kind]}</div><div className="mt-0.5 text-[11px] text-slate-400">{l.basis}</div></td>
                  <td className="px-3 py-2.5 text-slate-300">{fmtQuantity(l)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-300">{fmtRate(l)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${l.amountZar === null ? "text-amber-300" : "text-white"}`}>{lineAmountText(l)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.03]">
                <td className="px-3 py-2 text-xs font-semibold text-slate-300" colSpan={3}>{result.status === "PRICED" ? "Total (excluding VAT, which is applied when the draft is finalised)" : "Subtotal of the priced lines only"}</td>
                <td className="px-3 py-2 text-right font-black text-white">{zar(result.subtotalZar)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {result.warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-amber-300">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}

      {result.weightSources && result.weightSources.length > 0 && (
        <details className="mt-3 text-xs text-slate-400">
          <summary className="cursor-pointer">Where each wagon's mass came from</summary>
          <ul className="mt-1 space-y-0.5">
            {result.weightSources.map((w) => (
              <li key={w.wagonNumber}><span className="font-mono text-slate-300">{w.wagonNumber}</span> — {w.source === "WEIGHBRIDGE" ? "weighbridge" : w.source === "NOMINAL" ? "registered tare + loaded" : "unknown"}{w.grossTonnes != null ? `: ${fmtNum(w.grossTonnes)} t` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ClientNameModal({ calc, busy, onClose, onDone }: { calc: SavedCalculation; busy: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Modal title={`Client for the invoice — ${calc.calculationNumber}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-300">{calc.consignmentNumber} has no client name, and an invoice cannot be finalised without one. Enter it here (it is used for this draft only).</p>
      <Field label="Client name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name" maxLength={200} /></Field>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnNeutral} onClick={onClose}>Cancel</button>
        <button className={btnWarn} disabled={!name.trim() || busy} onClick={() => onDone(name.trim())}>{busy ? "Creating…" : "Create the draft"}</button>
      </div>
    </Modal>
  );
}
