import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Fuel, Landmark, Receipt } from 'lucide-react';
import api from '../services/api';

type CostType = 'FUEL' | 'TOLL' | 'OTHER';

type CostEntry = {
  id: string;
  type: CostType;
  amount: number;
  litres?: number | null;
  odometerKm?: number | null;
  note?: string | null;
  occurredAt: string;
};

const TYPES: { value: CostType; label: string; icon: typeof Fuel; hint: string }[] = [
  { value: 'FUEL', label: 'Fuel', icon: Fuel, hint: 'What you paid at the pump' },
  { value: 'TOLL', label: 'Toll', icon: Landmark, hint: 'Toll gate or plaza fee' },
  { value: 'OTHER', label: 'Other', icon: Receipt, hint: 'Parking, wash, small trip costs' },
];

/**
 * Driver cost capture: 20 seconds at the pump so the office knows what this
 * trip actually cost. Entries are measured facts — until a driver logs fuel,
 * the office sees that cost as unknown, never as zero.
 */
export default function Costs() {
  const navigate = useNavigate();
  const [type, setType] = useState<CostType>('FUEL');
  const [amount, setAmount] = useState('');
  const [litres, setLitres] = useState('');
  const [odometer, setOdometer] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<CostEntry[]>([]);
  const [recentFailed, setRecentFailed] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      const data = await api.get<CostEntry[]>('/driver-portal/costs/mine');
      setRecent(Array.isArray(data) ? data : []);
      setRecentFailed(false);
    } catch {
      setRecentFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError('Enter the amount you paid — it must be more than zero.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/driver-portal/costs', {
        type,
        amount: amountValue,
        litres: type === 'FUEL' && litres ? Number(litres) : undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
        note: note.trim() ? note.trim() : undefined,
      });
      setAmount('');
      setLitres('');
      setOdometer('');
      setNote('');
      setSaved(true);
      await loadRecent();
    } catch {
      setError(
        navigator.onLine
          ? 'Could not save that cost. Check the amount and try again — it has not been recorded yet.'
          : 'You are offline, so this cost cannot be saved yet. Reconnect and submit again — it has not been recorded.',
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white placeholder:text-gray-400 focus:border-blue-400 focus:outline-none';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 safe-area-top safe-area-bottom text-white">
      <header className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="Back to dashboard"
          className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold leading-tight">Log a cost</h1>
          <p className="text-xs text-gray-300">Fuel and tolls you actually paid on this trip</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-10">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cost type">
          {TYPES.map(({ value, label, icon: Icon, hint }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => setType(value)}
              className={`rounded-2xl border p-3 text-left transition ${
                type === value
                  ? 'border-blue-400 bg-blue-500/20'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <Icon className="mb-1 h-5 w-5" />
              <div className="text-sm font-bold">{label}</div>
              <div className="text-[11px] leading-snug text-gray-300">{hint}</div>
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="cost-amount" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-300">
              Amount paid (R)
            </label>
            <input
              id="cost-amount"
              className={inputClass}
              inputMode="decimal"
              placeholder="e.g. 850"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {type === 'FUEL' && (
            <div>
              <label htmlFor="cost-litres" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-300">
                Litres (from the pump slip)
              </label>
              <input
                id="cost-litres"
                className={inputClass}
                inputMode="decimal"
                placeholder="e.g. 38.5"
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor="cost-odo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-300">
              Odometer now (km, optional)
            </label>
            <input
              id="cost-odo"
              className={inputClass}
              inputMode="numeric"
              placeholder="e.g. 245310"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="cost-note" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-300">
              Note (optional)
            </label>
            <input
              id="cost-note"
              className={inputClass}
              placeholder={type === 'TOLL' ? 'e.g. Main plaza' : 'Anything dispatch should know'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Recorded — dispatch can now see what this trip cost.
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-blue-500 py-3.5 text-base font-bold text-white transition hover:bg-blue-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save cost'}
          </button>
        </form>

        <section aria-labelledby="recent-costs" className="mt-8">
          <h2 id="recent-costs" className="text-sm font-bold uppercase tracking-wide text-gray-300">
            Your recent costs
          </h2>
          {recentFailed ? (
            <p className="mt-2 text-sm text-gray-400">
              Couldn't load your recent costs right now. New entries above still save normally.
            </p>
          ) : recent.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-gray-300">
              Nothing logged yet. Log fuel at your next fill-up — it takes seconds and shows
              dispatch the true cost of the trip.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5">
              {recent.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-sm font-bold">
                    {entry.type === 'FUEL' ? 'Fuel' : entry.type === 'TOLL' ? 'Toll' : 'Other'}
                  </span>
                  <span className="font-bold">R{Number(entry.amount).toFixed(2)}</span>
                  {entry.litres != null && (
                    <span className="text-xs text-gray-300">{entry.litres} L</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(entry.occurredAt).toLocaleString('en-ZA', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
