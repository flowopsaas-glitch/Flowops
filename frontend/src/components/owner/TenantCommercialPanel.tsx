import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Save, TrendingUp, FileText, Receipt } from 'lucide-react';
import {
  COMMERCIAL_STATUSES,
  COMMERCIAL_STATUS_LABELS,
  addOwnerCommercialNote,
  createOwnerInvoice,
  createOwnerQuote,
  getOwnerTenantCommercialSummary,
  updateOwnerCommercialStatus,
  updateOwnerSubscriptionOverride,
} from '../../lib/ownerCommercial';
import type { CommercialStatus, OwnerCommercialSummary } from '../../lib/ownerCommercial';

/**
 * Where this tenant STANDS commercially.
 *
 * Everything else on the tenant page says what the tenant is DOING — MRR,
 * waybills, drivers, delivery rates. None of it says whether the relationship
 * is healthy. That used to live in someone's head and in Slack threads, so it
 * evaporated whenever that person was on leave or left. This panel is where it
 * now lives, next to the numbers that prompted the judgement.
 *
 * Notes here are owner-only and are never shown to the tenant.
 */

const STATUS_STYLES: Record<CommercialStatus, string> = {
  PROSPECT: 'border-slate-400/25 bg-slate-500/10 text-slate-200',
  ONBOARDING: 'border-sky-400/25 bg-sky-500/10 text-sky-200',
  ACTIVE: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  AT_RISK: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  RENEWAL_DUE: 'border-violet-400/25 bg-violet-500/10 text-violet-200',
  CHURNING: 'border-orange-400/25 bg-orange-500/10 text-orange-200',
  CHURNED: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  DORMANT: 'border-white/10 bg-white/5 text-white/50',
};

function StatusChip({ status }: { status: CommercialStatus | null }) {
  if (!status) {
    return (
      <span
        data-testid="commercial-status-chip"
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white/40"
      >
        Not set
      </span>
    );
  }
  return (
    <span
      data-testid="commercial-status-chip"
      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      {COMMERCIAL_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(v: number | null | undefined, c = 'ZAR') {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${c} ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

/** Small inline money/id summary for the opaque quote and invoice payloads. */
function payloadSummary(payload: unknown, keys: string[]): string {
  if (!payload || typeof payload !== 'object') return '—';
  const rec = payload as Record<string, unknown>;
  const parts = keys
    .filter((k) => rec[k] != null && rec[k] !== '')
    .map((k) => String(rec[k]));
  return parts.length ? parts.join(' · ') : '—';
}

export default function TenantCommercialPanel({ tenantId }: { tenantId: string }) {
  const [summary, setSummary] = useState<OwnerCommercialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  // Status form
  const [status, setStatus] = useState<CommercialStatus | ''>('');
  const [reason, setReason] = useState('');

  // Note form
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');

  // Quote form
  const [quote, setQuote] = useState({ fromAddress: '', toAddress: '', weight: '', price: '' });

  // Invoice form
  const [invoice, setInvoice] = useState({
    clientName: '',
    description: '',
    quantity: '1',
    unitPrice: '',
  });

  // Same shape as the other owner pages: a memoised thunk, so `load()` always
  // fires a fresh request rather than replaying a settled promise.
  const load = useCallback(
    () =>
      (async () => {
        if (!tenantId) return;
        try {
          const data = await getOwnerTenantCommercialSummary(tenantId);
          setSummary(data);
          setStatus(data.commercialStatus ?? '');
          setReason(data.commercialStatusReason ?? '');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load the commercial summary.');
        } finally {
          setLoading(false);
        }
      })(),
    [tenantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That commercial action failed.');
    } finally {
      setBusy('');
    }
  }

  const saveStatus = () =>
    run('status', () => updateOwnerCommercialStatus(tenantId, status as CommercialStatus, reason), 'Commercial status updated.');

  const saveNote = async () => {
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await run('note', () => addOwnerCommercialNote(tenantId, note, parsedTags), 'Note added.');
    setNote('');
    setTags('');
  };

  const saveQuote = async () => {
    await run(
      'quote',
      () =>
        createOwnerQuote(tenantId, {
          fromAddress: quote.fromAddress,
          toAddress: quote.toAddress,
          weight: Number(quote.weight),
          price: Number(quote.price),
          clientName: summary?.tenantName,
        }),
      'Quote created.',
    );
    setQuote({ fromAddress: '', toAddress: '', weight: '', price: '' });
  };

  const saveInvoice = async () => {
    await run(
      'invoice',
      () =>
        createOwnerInvoice(tenantId, {
          clientName: invoice.clientName || summary?.tenantName,
          items: [
            {
              description: invoice.description,
              quantity: Number(invoice.quantity) || 1,
              unitPrice: Number(invoice.unitPrice) || 0,
            },
          ],
        }),
      'Invoice created.',
    );
    setInvoice({ clientName: '', description: '', quantity: '1', unitPrice: '' });
  };

  const clearOverride = () =>
    run(
      'override',
      () => updateOwnerSubscriptionOverride(tenantId, { featureOverrides: null, priceOverrideZar: null }),
      'Subscription override cleared.',
    );

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
        <div className="text-sm text-white/40">Loading commercial standing…</div>
      </div>
    );
  }

  const statusReady = status !== '' && reason.trim().length > 0;
  const override = summary?.subscriptionOverrideSummary;

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-black text-white">Commercial Standing</div>
          <div className="mt-1 text-sm text-slate-400">
            Where this relationship stands, and why. Owner-only — never shown to the tenant.
          </div>
        </div>
        <StatusChip status={summary?.commercialStatus ?? null} />
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      {/* Current standing */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">
          Current reason
        </div>
        <div className="mt-1.5 text-sm text-white">
          {summary?.commercialStatusReason || (
            <span className="text-white/40">
              No commercial status recorded yet. Set one below — the reason is required, so the next
              person knows why.
            </span>
          )}
        </div>
        <div className="mt-2 text-[11px] text-white/35">
          Set {when(summary?.statusChangedAt ?? null)}
        </div>
      </div>

      {/* Set status */}
      <div className="mt-4 rounded-2xl border border-indigo-400/15 bg-indigo-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-black text-indigo-100">
          <TrendingUp className="h-4 w-4" /> Update standing
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"
              htmlFor="field-commercial-status"
            >
              Status
            </label>
            <select
              id="field-commercial-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CommercialStatus | '')}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            >
              <option value="">Select a status…</option>
              {COMMERCIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMMERCIAL_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"
              htmlFor="field-commercial-reason"
            >
              Reason (required)
            </label>
            <input
              id="field-commercial-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this tenant stand here?"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            />
          </div>
          <button
            type="button"
            disabled={!statusReady || busy === 'status'}
            onClick={saveStatus}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-400 to-blue-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {busy === 'status' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-black text-cyan-100">
          <MessageSquare className="h-4 w-4" /> Commercial notes
          <span className="text-[11px] font-bold text-white/40">
            {summary?.counts.notes ?? 0} on file
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"
              htmlFor="field-commercial-note"
            >
              What happened?
            </label>
            <input
              id="field-commercial-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Called the MD; renewal likely once the Durban lane stabilises."
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"
              htmlFor="field-commercial-tags"
            >
              Tags
            </label>
            <input
              id="field-commercial-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="renewal, pricing"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
          </div>
          <button
            type="button"
            disabled={note.trim().length === 0 || busy === 'note'}
            onClick={saveNote}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {busy === 'note' ? 'Saving…' : 'Add note'}
          </button>
        </div>

        {summary?.latestCommercialNote ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm text-white">{summary.latestCommercialNote.note}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/35">
              <span>{summary.latestCommercialNote.createdByEmail ?? 'unknown author'}</span>
              <span>·</span>
              <span>{when(summary.latestCommercialNote.createdAt)}</span>
              {(summary.latestCommercialNote.tags ?? []).length > 0 ? (
                <>
                  <span>·</span>
                  {(summary.latestCommercialNote.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60"
                    >
                      {t}
                    </span>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-white/40">
            No notes yet. Anything agreed with this customer belongs here, not in a chat thread.
          </div>
        )}
      </div>

      {/* Overrides + latest documents */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">
            Subscription override
          </div>
          <div className="mt-1.5 text-sm text-white">
            {override ? (
              <>
                {money(override.priceOverrideZar)}
                {override.features.length > 0 ? (
                  <span className="text-white/50"> · {override.features.join(', ')}</span>
                ) : null}
              </>
            ) : (
              <span className="text-white/40">Billed at list price</span>
            )}
          </div>
          {override ? (
            <button
              type="button"
              disabled={busy === 'override'}
              onClick={clearOverride}
              className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              {busy === 'override' ? 'Clearing…' : 'Clear override'}
            </button>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">
            <FileText className="h-3.5 w-3.5" /> Latest quote
          </div>
          <div className="mt-1.5 truncate text-sm text-white">
            {payloadSummary(summary?.latestQuote, ['fromAddress', 'toAddress'])}
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            {summary?.counts.quotes ?? 0} raised
            {summary?.latestQuote &&
            typeof summary.latestQuote === 'object' &&
            'price' in (summary.latestQuote as object)
              ? ` · ${money(Number((summary.latestQuote as { price: unknown }).price))}`
              : ''}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">
            <Receipt className="h-3.5 w-3.5" /> Latest invoice
          </div>
          <div className="mt-1.5 truncate text-sm text-white">
            {payloadSummary(summary?.latestInvoice, ['invoiceNumber', 'clientName'])}
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            {summary?.counts.invoices ?? 0} raised
            {summary?.latestInvoice &&
            typeof summary.latestInvoice === 'object' &&
            'total' in (summary.latestInvoice as object)
              ? ` · ${money(Number((summary.latestInvoice as { total: unknown }).total))}`
              : ''}
          </div>
        </div>
      </div>

      {/* Raise a quote / invoice on the tenant's behalf */}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-black text-white">Raise a quote</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { key: 'fromAddress' as const, label: 'From', ph: 'Johannesburg' },
              { key: 'toAddress' as const, label: 'To', ph: 'Durban' },
              { key: 'weight' as const, label: 'Weight (kg)', ph: '1200' },
              { key: 'price' as const, label: 'Price (ZAR)', ph: '8400' },
            ].map(({ key, label, ph }) => (
              <div key={key}>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50"
                  htmlFor={`field-quote-${key}`}
                >
                  {label}
                </label>
                <input
                  id={`field-quote-${key}`}
                  value={quote[key]}
                  onChange={(e) => setQuote((q) => ({ ...q, [key]: e.target.value }))}
                  placeholder={ph}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={
              busy === 'quote' ||
              !quote.fromAddress.trim() ||
              !quote.toAddress.trim() ||
              !(Number(quote.weight) > 0) ||
              !(Number(quote.price) >= 0)
            }
            onClick={saveQuote}
            className="mt-3 rounded-xl bg-gradient-to-r from-blue-400 to-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            {busy === 'quote' ? 'Creating…' : 'Create quote'}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-black text-white">Raise an invoice</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50"
                htmlFor="field-invoice-client"
              >
                Client
              </label>
              <input
                id="field-invoice-client"
                value={invoice.clientName}
                onChange={(e) => setInvoice((i) => ({ ...i, clientName: e.target.value }))}
                placeholder={summary?.tenantName ?? 'Client name'}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50"
                htmlFor="field-invoice-desc"
              >
                Line item
              </label>
              <input
                id="field-invoice-desc"
                value={invoice.description}
                onChange={(e) => setInvoice((i) => ({ ...i, description: e.target.value }))}
                placeholder="Onboarding & setup"
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50"
                htmlFor="field-invoice-qty"
              >
                Qty
              </label>
              <input
                id="field-invoice-qty"
                type="number"
                min={1}
                value={invoice.quantity}
                onChange={(e) => setInvoice((i) => ({ ...i, quantity: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50"
                htmlFor="field-invoice-price"
              >
                Unit price (ZAR)
              </label>
              <input
                id="field-invoice-price"
                value={invoice.unitPrice}
                onChange={(e) => setInvoice((i) => ({ ...i, unitPrice: e.target.value }))}
                placeholder="5000"
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={busy === 'invoice' || !invoice.description.trim() || !(Number(invoice.unitPrice) >= 0)}
            onClick={saveInvoice}
            className="mt-3 rounded-xl bg-gradient-to-r from-blue-400 to-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            {busy === 'invoice' ? 'Creating…' : 'Create invoice'}
          </button>
          <div className="mt-2 text-[10px] text-white/35">
            Numbering and VAT are computed by the billing service, not here.
          </div>
        </div>
      </div>
    </div>
  );
}
