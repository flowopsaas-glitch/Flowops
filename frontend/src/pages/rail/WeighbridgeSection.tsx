import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { listWeighbridgeReadings, recordWeighbridgeReading, type WeighbridgeReading, type WeighbridgeResult } from "../../api/railTariffApi";
import type { RailConsignment } from "../../api/railApi";
import {
  OVERLOAD_LABEL, buildWeighbridgeDraft, currentReadingIds, describeLimit, emptyWeighbridgeForm, fmtNum, isOnHold, overloadTone, weighbridgeFormErrors,
  type WeighbridgeFormState,
} from "../../lib/railTariff";
import { useToast } from "../../components/toast-context";
import { Banner, Field, Modal, Pill, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";

/**
 * Weighbridge readings for one consignment, and the hold they can put it on.
 *
 * The overload rule (actual tonnes > max axle load × axles), the limit that applies and the hold are all decided by the SERVER:
 * the form sends a mass and the server answers with a verdict, which this component shows. Readings are append-only; the hold
 * follows each wagon's latest reading and lifts by itself when every wagon has been re-weighed within its limit — there is no
 * manual override, so none is offered.
 */
export default function WeighbridgeSection({ consignment, canWrite, onChanged }: { consignment: RailConsignment; canWrite: boolean; onChanged?: () => void }) {
  const [readings, setReadings] = useState<WeighbridgeReading[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const reload = useCallback(() => (async () => {
 setReadings(await listWeighbridgeReadings(consignment.id)); setError(null);
  })().catch((e) => {
 setError((e as Error)?.message || "request failed");
  }), [consignment.id]);

  useEffect(() => { void reload(); }, [reload]);

  const current = useMemo(() => currentReadingIds(readings ?? []), [readings]);
  const held = isOnHold(consignment);
  const wagons = consignment.wagons ?? [];

  return (
    <Section
      title="Weighbridge & load"
      right={canWrite && consignment.status !== "CANCELLED" ? <button className={btnPrimary} onClick={() => setRecording(true)}><Plus className="h-3.5 w-3.5" /> Record reading</button> : undefined}
    >
      <div data-testid="weighbridge-section">
        {held && (
          <Banner tone="danger" title="On hold for load adjustment — dispatch is blocked">
            {consignment.holdReason ?? "A wagon has not been re-weighed within its limit."}
            <span className="mt-1 block opacity-80">Re-weigh each overloaded wagon within its limit and the hold lifts by itself. There is no manual override.</span>
          </Banner>
        )}
        {error && <p className="mb-2 text-xs text-amber-300">Readings could not be loaded: {error}</p>}
        {!readings && !error && <div className="flex items-center gap-2 py-4 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>}
        {readings && readings.length === 0 && <p className="text-xs text-slate-500">No weighbridge readings yet. Until a wagon is weighed, its mass is the tare + loaded tonnes registered for it.</p>}
        {readings && readings.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs" aria-label="Weighbridge readings">
              <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr><th className="px-3 py-2">Wagon</th><th className="px-3 py-2">Gross mass</th><th className="px-3 py-2">Limit</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Weighed</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {readings.map((r) => (
                  <tr key={r.id} className={current.has(r.id) ? "" : "opacity-60"}>
                    <td className="px-3 py-2 font-mono text-slate-200">{r.wagonNumber}{current.has(r.id) && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 font-sans text-[10px] text-slate-300" title="The most recent reading of this wagon — the one the hold follows">current</span>}</td>
                    <td className="px-3 py-2 text-slate-200">{fmtNum(r.actualTonnes)} t</td>
                    <td className="px-3 py-2 text-slate-400">{describeLimit(r)}</td>
                    <td className="px-3 py-2"><Pill tone={overloadTone(r.status)}>{OVERLOAD_LABEL[r.status]}{r.status === "OVERLOADED" && r.excessTonnes != null ? ` · ${fmtNum(r.excessTonnes)} t over` : ""}</Pill></td>
                    <td className="px-3 py-2 text-slate-400">{new Date(r.weighedAt).toLocaleString()}{r.weighbridge ? ` · ${r.weighbridge}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {recording && (
        <RecordModal
          consignment={consignment}
          wagons={wagons}
          onClose={() => setRecording(false)}
          onDone={() => { setRecording(false); void reload(); onChanged?.(); }}
        />
      )}
    </Section>
  );
}

function RecordModal({ consignment, wagons, onClose, onDone }: { consignment: RailConsignment; wagons: NonNullable<RailConsignment["wagons"]>; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [f, setF] = useState<WeighbridgeFormState>(emptyWeighbridgeForm());
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WeighbridgeResult | null>(null);
  const errors = weighbridgeFormErrors(f);
  const set = <K extends keyof WeighbridgeFormState>(k: K, v: WeighbridgeFormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const err = (k: keyof WeighbridgeFormState) => (attempted || f[k] !== "" ? errors[k] : undefined);
  const wagon = wagons.find((w) => w.wagonNumber === f.wagonNumber);

  async function save() {
    setAttempted(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const r = await recordWeighbridgeReading(buildWeighbridgeDraft(consignment.id, f));
      setResult(r);
      showToast(r.hold.changed ? (r.hold.held ? "Reading recorded — the consignment is now on hold" : "Reading recorded — the hold is lifted") : "Reading recorded", r.hold.held ? "error" : "success");
    } catch (e) {
      showToast((e as Error)?.message || "Could not record the reading", "error");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const { evaluation, hold } = result;
    return (
      <Modal title={`Reading recorded — ${result.reading.wagonNumber}`} onClose={onDone}>
        <div className="space-y-3" data-testid="weighbridge-verdict">
          <Pill tone={overloadTone(evaluation.status)}>{OVERLOAD_LABEL[evaluation.status]}</Pill>
          <p className="text-sm text-slate-200">{evaluation.reason}</p>
          {evaluation.status === "UNVERIFIED" && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Recorded, but not judged: with no verified corridor limit and no limit entered, the reading is neither a pass nor a hold. Enter the wagon's own rating on the next reading to have it checked.
            </p>
          )}
          {hold.held
            ? <Banner tone="danger" title={hold.changed ? "The consignment is now on hold for load adjustment" : "The consignment remains on hold"}>{hold.reason}</Banner>
            : hold.changed && <Banner tone="ok" title="The hold is lifted">Every wagon's latest reading is within its limit.</Banner>}
        </div>
        <div className="mt-5 flex justify-end"><button className={btnPrimary} onClick={onDone}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title={`Record a weighbridge reading — ${consignment.consignmentNumber}`} onClose={onClose}>
      {wagons.length === 0 ? (
        <p className="text-sm text-slate-300">This consignment has no wagons registered, so there is nothing to weigh. Register its wagons first.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Wagon *">
            <select className={inputCls} value={f.wagonNumber} onChange={(e) => { const w = wagons.find((x) => x.wagonNumber === e.target.value); setF((s) => ({ ...s, wagonNumber: e.target.value, axles: w?.axles ? String(w.axles) : "" })); }} aria-label="Wagon">
              <option value="">Select a wagon</option>
              {wagons.map((w) => <option key={w.id} value={w.wagonNumber}>{w.wagonNumber}{w.axles ? ` · ${w.axles} axles` : ""}</option>)}
            </select>
            {err("wagonNumber") && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.wagonNumber}</span>}
          </Field>
          <Field label="Gross mass on the weighbridge (t) *">
            <input className={inputCls} inputMode="decimal" value={f.actualTonnes} onChange={(e) => set("actualTonnes", e.target.value)} aria-label="Gross mass" />
            {err("actualTonnes") && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.actualTonnes}</span>}
          </Field>
          <Field label={`Axles${wagon?.axles ? "" : " (needed to check the limit)"}`}>
            <input className={inputCls} inputMode="numeric" value={f.axles} onChange={(e) => set("axles", e.target.value)} aria-label="Axles" placeholder={wagon?.axles ? String(wagon.axles) : "e.g. 4"} />
            {wagon?.axles ? <span className="mt-1 block text-[11px] text-slate-500">Registered with {wagon.axles} axles. If you enter a different number the smaller one is used — it can tighten the check, never relax it.</span> : null}
            {err("axles") && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.axles}</span>}
          </Field>
          <Field label="Maximum axle load (t) — optional">
            <input className={inputCls} inputMode="decimal" value={f.maxAxleLoadTonnes} onChange={(e) => set("maxAxleLoadTonnes", e.target.value)} aria-label="Maximum axle load" />
            <span className="mt-1 block text-[11px] text-slate-500">The wagon's own rating. A verified corridor limit always applies too, and the stricter of the two wins — this can tighten the check, never relax it.</span>
            {err("maxAxleLoadTonnes") && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors.maxAxleLoadTonnes}</span>}
          </Field>
          <Field label="Weighbridge"><input className={inputCls} value={f.weighbridge} onChange={(e) => set("weighbridge", e.target.value)} aria-label="Weighbridge" /></Field>
          <Field label="Note"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} aria-label="Note" /></Field>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-500">The server decides whether the wagon is overloaded and whether the consignment goes on hold. A reading cannot be edited or deleted; to correct an overload, weigh the wagon again.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnNeutral} onClick={onClose}>Cancel</button>
        {wagons.length > 0 && <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? "Recording…" : "Record reading"}</button>}
      </div>
    </Modal>
  );
}
