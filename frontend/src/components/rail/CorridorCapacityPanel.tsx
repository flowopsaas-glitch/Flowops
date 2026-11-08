import { useCallback, useEffect, useState } from 'react';
import {
  CAPACITY_STATUS_LABEL,
  CAPACITY_UNIT_LABEL,
  deleteCorridorCapacity,
  getCorridorCapacity,
  previewCorridorCapacity,
  upsertCorridorCapacity,
  type CapacityCheck,
  type CapacityStatus,
  type CorridorCapacity,
} from '../../api/railSlotApi';

/**
 * What this operator holds against a corridor — the half of slot allocation
 * that did not exist.
 *
 * The page around it shows the infrastructure manager's PUBLISHED capacity
 * (Annexure 33b). This panel is deliberately different in kind: it is this
 * tenant's own ledger and its own commitments. It is labelled that way
 * throughout, because a tenant's figure must never be mistaken for the
 * network's.
 *
 * Everything here is ADVISORY. The infrastructure manager decides what is
 * allocated, and applying for more than you expect to be granted is a rational
 * thing for an operator to do. Nothing here refuses a submission — it exists so
 * the operator can see the headroom before they ask, and after they hold it.
 */

const STATUS_STYLE: Record<CapacityStatus, string> = {
  OK: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  TIGHT: 'border-amber-200 bg-amber-50 text-amber-800',
  OVERSUBSCRIBED: 'border-rose-200 bg-rose-50 text-rose-800',
  UNKNOWN: 'border-slate-200 bg-slate-50 text-slate-600',
};

const d = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};
const n = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-ZA', { maximumFractionDigits: digits });

export default function CorridorCapacityPanel({ corridors }: { corridors: Array<{ code: string; name: string }> }) {
  const [statements, setStatements] = useState<CorridorCapacity[]>([]);
  const [corridorCode, setCorridorCode] = useState('');
  const [check, setCheck] = useState<CapacityCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Statement form
  const [form, setForm] = useState({ theoretical: '', factor: '0.65', from: '', until: '', sourceRef: '' });

  const load = useCallback(
    () =>
      (async () => {
        if (!corridorCode) {
          setCheck(null);
          setLoading(false);
          return;
        }
        setError('');
        try {
          const [list, preview] = await Promise.all([
            getCorridorCapacity(corridorCode),
            previewCorridorCapacity({
              corridorCode,
              from: new Date().toISOString(),
              until: new Date(Date.now() + 365 * 86_400_000).toISOString(),
            }),
          ]);
          setStatements(list);
          setCheck(preview);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load corridor capacity.');
        } finally {
          setLoading(false);
        }
      })(),
    [corridorCode],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStatement() {
    if (!corridorCode) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await upsertCorridorCapacity({
        corridorCode,
        validFrom: new Date(form.from).toISOString(),
        validUntil: new Date(form.until).toISOString(),
        theoreticalPathsPerDay: Number(form.theoretical),
        capacityFactor: Number(form.factor),
        sourceRef: form.sourceRef || undefined,
      });
      setNotice('Capacity statement saved.');
      setForm((f) => ({ ...f, theoretical: '', sourceRef: '' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the capacity statement.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await deleteCorridorCapacity(id);
      setNotice('Capacity statement removed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the capacity statement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Your position on this corridor</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
            The figures above are the <b>infrastructure manager&rsquo;s published capacity</b>. This panel is
            different in kind: it is <b>your own</b> ledger, measured against <b>your own</b> slot
            applications. It cannot see any other operator&rsquo;s allocations, and it is advisory — the
            infrastructure manager decides what is allocated, so nothing here blocks an application. It
            exists so you can see the headroom before you ask for it.
          </p>
        </div>
        <select
          aria-label="Corridor"
          value={corridorCode}
          onChange={(e) => setCorridorCode(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
        >
          <option value="">Select a corridor…</option>
          {corridors.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}

      {!corridorCode ? (
        <p className="mt-4 text-xs text-slate-500">Choose a corridor to see how much of it you already hold.</p>
      ) : loading ? (
        <p className="mt-4 text-xs text-slate-500">Loading…</p>
      ) : check ? (
        <div className="mt-4 space-y-4">
          <div className={`rounded-md border px-4 py-3 ${STATUS_STYLE[check.status]}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{CAPACITY_STATUS_LABEL[check.status]}</span>
              {check.utilisation != null ? (
                <span className="text-xs">{(check.utilisation * 100).toFixed(0)}% of practical capacity</span>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
              <div>
                <div className="opacity-70">Practical capacity</div>
                <div data-testid="declared" className="text-sm font-semibold">
                  {n(check.declaredPathsPerDay)} paths/day
                </div>
                {check.theoreticalPathsPerDay != null ? (
                  <div className="opacity-70">
                    {n(check.theoreticalPathsPerDay)} theoretical &times; {n(check.capacityFactor, 2)}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="opacity-70">Granted to you</div>
                <div data-testid="committed" className="text-sm font-semibold">
                  {n(check.committedPathsPerDay)}
                </div>
              </div>
              <div>
                <div className="opacity-70">You have applied for</div>
                <div data-testid="pending" className="text-sm font-semibold">
                  {n(check.pendingPathsPerDay)}
                </div>
              </div>
              <div>
                <div className="opacity-70">Headroom</div>
                <div data-testid="headroom" className="text-sm font-semibold">
                  {check.headroomPathsPerDay == null ? '—' : n(check.headroomPathsPerDay)}
                </div>
              </div>
            </div>
            {check.dataStatus && check.dataStatus !== 'VERIFIED' ? (
              <p className="mt-2 text-xs opacity-80">
                Unsourced figure — cite where it came from before relying on it.
              </p>
            ) : null}
          </div>

          {check.status === 'UNKNOWN' ? (
            <p className="text-xs text-slate-600">{check.reason}</p>
          ) : null}

          {check.possessions.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold text-slate-700">
                Possessions on this corridor ({check.possessions.length})
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                {check.possessions.map((p) => (
                  <li key={p.id}>
                    {p.title} — {d(p.startsAt)} to {d(p.endsAt)}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-slate-500">
                Shown for judgement, not deducted: what a possession costs depends on whether it is a full
                closure or single-line working.
              </p>
            </div>
          ) : null}

          {check.contributing.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Application</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 font-medium">Paths/day</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {check.contributing.map((c) => (
                    <tr key={c.applicationNumber}>
                      <td className="py-1 pr-3">{c.applicationNumber}</td>
                      <td className="py-1 pr-3">{c.status}</td>
                      <td className="py-1">{n(c.pathsPerDay, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* The ledger itself */}
      {corridorCode ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Capacity statements for {corridorCode}
          </h3>

          {statements.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              None yet. Without one, headroom cannot be stated — the check will report &ldquo;no capacity
              stated&rdquo; rather than guess.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-xs">
              {statements.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-slate-700">
                    {d(s.validFrom)} – {d(s.validUntil)}: {n(s.theoreticalPathsPerDay)} theoretical &times;{' '}
                    {n(s.capacityFactor, 2)} = <b>{n(s.practicalPathsPerDay)}</b> {CAPACITY_UNIT_LABEL[s.unit]}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        s.dataStatus === 'VERIFIED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {s.dataStatus === 'VERIFIED' ? 'Verified' : 'Unsourced'}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(s.id)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Theoretical paths/day
              <input
                type="number"
                min={0}
                value={form.theoretical}
                onChange={(e) => setForm((f) => ({ ...f, theoretical: e.target.value }))}
                placeholder="20"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Capacity factor
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.factor}
                onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              From
              <input
                type="date"
                value={form.from}
                onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Until
              <input
                type="date"
                value={form.until}
                onChange={(e) => setForm((f) => ({ ...f, until: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Source
              <input
                value={form.sourceRef}
                onChange={(e) => setForm((f) => ({ ...f, sourceRef: e.target.value }))}
                placeholder="Annexure 33b FY26/27"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !form.theoretical || !form.from || !form.until}
            onClick={saveStatement}
            className="mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save statement'}
          </button>
          <p className="mt-1.5 text-[10px] text-slate-500">
            The practical figure is computed from theoretical &times; factor on the server, so the two can
            never contradict each other.
          </p>
        </div>
      ) : null}
    </section>
  );
}
