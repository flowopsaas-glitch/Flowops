import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getDangerousGoods, type DgReadiness, type DgSummary } from "../../api/railChangeApi";
import { updateConsignment, type RailConsignment } from "../../api/railApi";
import {
  DG_FIELDS, DG_FIELD_LABEL, dgBadge, dgFormFrom, dgFormToPayload, validateDgForm, wagonDgLabel, type DgFormState,
} from "../../lib/railDangerousGoods";
import { useToast } from "../../components/toast-context";
import { Banner, Field, Pill, btnPrimary, inputCls } from "./railUi";

/** The list badge: nothing for a consignment with no dangerous goods, green when ready, red with the number of gaps otherwise. */
export function DgBadge({ dg }: { dg?: DgSummary | null }) {
  const v = dgBadge(dg);
  if (!v.show) return <span className="text-slate-600" aria-label="No dangerous goods">—</span>;
  return <Pill tone={v.tone} title={v.title}>{v.label}</Pill>;
}

/** A wagon's own dangerous-goods label (UN number · class), or nothing. */
export function WagonDgPill({ wagon }: { wagon: Parameters<typeof wagonDgLabel>[0] }) {
  const label = wagonDgLabel(wagon);
  if (!label) return null;
  return <Pill tone={label.startsWith("DG —") ? "danger" : "warn"} title="This wagon carries dangerous goods">{label}</Pill>;
}

/**
 * Dangerous-goods section of the consignment drawer: what the dispatch gate sees (from the server), plus an edit
 * form for the five mandatory fields. Whether the consignment may depart is the SERVER's call (it refuses a
 * move to DEPARTED / IN_TRANSIT / AT_INTERCHANGE with incomplete details) — this section only shows it.
 */
export default function DangerousGoodsSection({ consignment, canWrite, onSaved }: { consignment: RailConsignment; canWrite: boolean; onSaved?: () => void }) {
  const { showToast } = useToast();
  const [readiness, setReadiness] = useState<DgReadiness | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<DgFormState>(() => dgFormFrom(consignment));
  const [saving, setSaving] = useState(false);

  const loadReadiness = useCallback(() => (async () => {
 setReadiness(await getDangerousGoods(consignment.id)); setLoadFailed(false);
  })().catch(() => {
 setReadiness(null); setLoadFailed(true);
  }), [consignment.id]);

  useEffect(() => { void loadReadiness(); }, [loadReadiness]);
  // A different consignment (or a refreshed row) resets the form to what is
  // saved — adjusted during render when the prop changes, not in an effect.
  const [formConsignment, setFormConsignment] = useState(consignment);
  if (consignment !== formConsignment) {
    setFormConsignment(consignment);
    setForm(dgFormFrom(consignment));
  }

  const errors = validateDgForm(form);
  const hasErrors = Object.keys(errors).length > 0;
  const set = (patch: Partial<DgFormState>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (hasErrors) return;
    setSaving(true);
    try {
      await updateConsignment(consignment.id, dgFormToPayload(form));
      showToast("Dangerous-goods details saved", "success");
      await loadReadiness();
      onSaved?.();
    } catch (e) {
      showToast(`Could not save: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6" data-testid="dg-section" aria-label="Dangerous goods">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-300">Dangerous goods</h3>

      {readiness?.required && !readiness.ready && (
        <Banner tone="danger" title="Departure is blocked — dangerous-goods details are incomplete">{readiness.summary}</Banner>
      )}
      {readiness?.required && readiness.ready && <Banner tone="ok" title="Dangerous goods — all mandatory details are complete">{readiness.summary}</Banner>}
      {readiness && !readiness.required && <p className="text-xs text-slate-500">No dangerous goods declared. Tick the box below to declare them; the five details are then required before departure.</p>}
      {loadFailed && <p className="text-xs text-slate-500">Dangerous-goods readiness could not be loaded.</p>}
      {readiness && readiness.dgWagons > 0 && <p className="mt-2 text-xs text-slate-400">{readiness.dgWagons} wagon{readiness.dgWagons === 1 ? "" : "s"} flagged individually; a wagon&apos;s empty field inherits the consignment&apos;s value.</p>}

      {canWrite ? (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" data-testid="dg-flag" checked={form.isDangerousGoods} onChange={(e) => set({ isDangerousGoods: e.target.checked })} />
            This consignment carries dangerous goods
          </label>
          {form.isDangerousGoods && (
            <div className="grid gap-3 sm:grid-cols-2">
              {DG_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <input
                    className={inputCls} value={form[f.key]} placeholder={f.placeholder} aria-invalid={!!errors[f.key]}
                    onChange={(e) => set({ [f.key]: e.target.value } as Partial<DgFormState>)}
                  />
                  {errors[f.key] && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{errors[f.key]}</span>}
                </Field>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" className={btnPrimary} disabled={saving || hasErrors} onClick={() => void save()}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save dangerous-goods details
            </button>
          </div>
        </div>
      ) : (
        consignment.isDangerousGoods && (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {DG_FIELDS.map((f) => (
              <div key={f.key} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{DG_FIELD_LABEL[f.key]}</dt>
                <dd className="mt-0.5 break-all text-sm text-slate-200">{consignment[f.key] || "—"}</dd>
              </div>
            ))}
          </dl>
        )
      )}
    </section>
  );
}
