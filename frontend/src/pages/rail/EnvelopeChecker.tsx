import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  checkEnvelope, GAUGE_LABEL, type Corridor, type EnvelopeResult, type RailGauge,
} from "../../api/railSlotApi";
import type { RailConsignment } from "../../api/railApi";
import { envelopeLabel, envelopeTone } from "../../lib/railSlot";
import { Field, Pill, Section, btnPrimary, inputCls } from "./railUi";
import { useToast } from "../../components/ToastProvider";

/**
 * Corridor-envelope compatibility checker. It reports COMPATIBLE / INCOMPATIBLE / UNVERIFIED —
 * never a bare "OK": when a corridor's limits (or a wagon's particulars) are not loaded the answer
 * is UNVERIFIED and the UI says so in words.
 */
export default function EnvelopeChecker({ corridors, consignments }: { corridors: Corridor[]; consignments: RailConsignment[] }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"consignment" | "manual">("consignment");
  const [corridorCode, setCorridorCode] = useState("");
  const [consignmentId, setConsignmentId] = useState("");
  const [gauge, setGauge] = useState<RailGauge | "">("");
  const [tare, setTare] = useState("");
  const [loaded, setLoaded] = useState("");
  const [axles, setAxles] = useState("");
  const [axleLoad, setAxleLoad] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EnvelopeResult | null>(null);

  const canRun = mode === "consignment" ? !!consignmentId : !!corridorCode && (!!axleLoad || (!!tare && !!loaded && !!axles) || !!gauge);

  async function run() {
    setBusy(true);
    try {
      const num = (v: string) => (v === "" ? undefined : Number(v));
      setResult(
        await checkEnvelope(
          mode === "consignment"
            ? { consignmentId, corridorCode: corridorCode || undefined }
            : {
                corridorCode,
                subjects: [{
                  label: "Rolling stock", gauge: gauge || undefined, axleLoadTonnes: num(axleLoad),
                  tareTonnes: num(tare), loadedTonnes: num(loaded), axles: num(axles),
                }],
              },
        ),
      );
    } catch (e) {
      showToast((e as Error)?.message || "Envelope check failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Corridor envelope check" right={<ShieldCheck className="h-4 w-4 text-emerald-400" />}>
      <p className="mb-3 text-xs text-slate-400">
        Checks gauge and axle load against the selected corridor. A wagon or consignment that violates a <b>verified</b> corridor is rejected; where limits are not loaded the result is <b>unverified</b>, never a pass.
      </p>
      <div className="mb-3 flex gap-2" role="tablist" aria-label="Check mode">
        {(["consignment", "manual"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setResult(null); }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${mode === m ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 hover:text-white"}`}>
            {m === "consignment" ? "A consignment" : "Manual particulars"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={mode === "consignment" ? "Corridor (blank = the consignment's own)" : "Corridor *"}>
          <select className={inputCls} value={corridorCode} onChange={(e) => setCorridorCode(e.target.value)} aria-label="Corridor">
            <option value="">{mode === "consignment" ? "Use the consignment's corridor" : "Select a corridor"}</option>
            {corridors.map((c) => <option key={c.code} value={c.code}>{c.name}{c.dataStatus === "VERIFIED" ? "" : " (limits not loaded)"}</option>)}
          </select>
        </Field>
        {mode === "consignment" ? (
          <Field label="Consignment *">
            <select className={inputCls} value={consignmentId} onChange={(e) => setConsignmentId(e.target.value)} aria-label="Consignment">
              <option value="">Select a consignment</option>
              {consignments.map((c) => <option key={c.id} value={c.id}>{c.consignmentNumber} — {c.commodity}</option>)}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Gauge">
              <select className={inputCls} value={gauge} onChange={(e) => setGauge(e.target.value as RailGauge | "")} aria-label="Gauge">
                <option value="">Not declared</option>
                {(Object.keys(GAUGE_LABEL) as RailGauge[]).map((g) => <option key={g} value={g}>{GAUGE_LABEL[g]}</option>)}
              </select>
            </Field>
            <Field label="Axle load (t) — or fill the three below">
              <input className={inputCls} type="number" min="0" step="0.01" value={axleLoad} onChange={(e) => setAxleLoad(e.target.value)} aria-label="Axle load" />
            </Field>
            <Field label="Tare (t)"><input className={inputCls} type="number" min="0" value={tare} onChange={(e) => setTare(e.target.value)} aria-label="Tare" /></Field>
            <Field label="Loaded (t)"><input className={inputCls} type="number" min="0" value={loaded} onChange={(e) => setLoaded(e.target.value)} aria-label="Loaded" /></Field>
            <Field label="Axles"><input className={inputCls} type="number" min="1" max="12" value={axles} onChange={(e) => setAxles(e.target.value)} aria-label="Axles" /></Field>
          </>
        )}
      </div>
      <div className="mt-4">
        <button className={btnPrimary} disabled={!canRun || busy} onClick={run}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Run check
        </button>
      </div>
      {result && <EnvelopeResultCard result={result} />}
    </Section>
  );
}

export function EnvelopeResultCard({ result }: { result: EnvelopeResult }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4" data-testid="envelope-result">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={envelopeTone(result.status)}>{envelopeLabel(result.status)}</Pill>
        <span className="text-xs text-slate-400">
          {result.corridor ? `${result.corridor.name} corridor${result.corridorVerified ? " (verified data)" : " (data not verified)"}` : `No catalog corridor matched${result.corridorQuery ? ` “${result.corridorQuery}”` : ""}`}
          {result.consignment ? ` · ${result.consignment.consignmentNumber} · ${result.consignment.wagons} wagon(s)` : ""}
        </span>
      </div>
      {result.violations.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-rose-300">{result.violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
      )}
      {result.warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-300">{result.warnings.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
      )}
      {result.unverified.length > 0 && (
        <div className="mt-3 text-xs text-slate-400">
          <div className="font-semibold text-slate-300">Could not be checked</div>
          <ul className="list-disc space-y-1 pl-5">{result.unverified.map((v, i) => <li key={i}>{v}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
