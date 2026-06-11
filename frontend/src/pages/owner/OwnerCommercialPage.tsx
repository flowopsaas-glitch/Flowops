import { useEffect, useMemo, useState } from 'react'
import { useOwnerSession } from '../../hooks/useOwnerSession'
import { useOwnerRouteGuard } from '../../hooks/useOwnerRouteGuard'
import {
  addOwnerCommercialNote,
  createOwnerInvoice,
  createOwnerQuote,
  getOwnerTenantCommercialList,
  getOwnerTenantCommercialSummary,
  type OwnerCommercialSummary,
  updateOwnerCommercialStatus,
  updateOwnerSubscriptionOverride,
} from '../../lib/ownerCommercial'

const DEFAULT_STATUS = 'ACTIVE'

export default function OwnerCommercialPage() {
  useOwnerRouteGuard({
    requireSession: true,
    redirectTo: '/owner/hidden-login',
  })

  const { isLoggedIn, user, logout } = useOwnerSession()

  const [items, setItems] = useState<OwnerCommercialSummary[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null)
  const [selected, setSelected] = useState<OwnerCommercialSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [search, setSearch] = useState('')

  const [noteText, setNoteText] = useState('')
  const [noteTags, setNoteTags] = useState('owner,commercial')

  const [statusValue, setStatusValue] = useState(DEFAULT_STATUS)
  const [statusReason, setStatusReason] = useState('')

  const [overridePlanCode, setOverridePlanCode] = useState('FLOWOPS-PRO-OWNER')
  const [overridePlanName, setOverridePlanName] = useState('FlowOps Pro Owner')
  const [overrideBillingCycle, setOverrideBillingCycle] = useState('MONTHLY')
  const [overridePrice, setOverridePrice] = useState('1499')
  const [overrideCurrency, setOverrideCurrency] = useState('ZAR')
  const [overrideStartsAt, setOverrideStartsAt] = useState('2026-03-13')
  const [overrideEndsAt, setOverrideEndsAt] = useState('')
  const [overrideFeatures, setOverrideFeatures] = useState('month_end_billing,contract_billing,q94_contract_codes,billing_batches,invoice_drafts,ai_waybill_monitoring')
  const [overrideNotes, setOverrideNotes] = useState('Owner console override update')

  const [quoteTitle, setQuoteTitle] = useState('Owner commercial quote')
  const [quoteSummary, setQuoteSummary] = useState('Owner-issued commercial quote')
  const [quoteAmount, setQuoteAmount] = useState('1499')
  const [quoteCurrency, setQuoteCurrency] = useState('ZAR')
  const [quoteValidUntil, setQuoteValidUntil] = useState('2026-03-28')
  const [quoteNotes, setQuoteNotes] = useState('Owner console quote')
  const [quoteLine1Desc, setQuoteLine1Desc] = useState('Platform subscription')
  const [quoteLine1Amount, setQuoteLine1Amount] = useState('1199')
  const [quoteLine2Desc, setQuoteLine2Desc] = useState('AI operations add-on')
  const [quoteLine2Amount, setQuoteLine2Amount] = useState('300')

  const [invoiceTitle, setInvoiceTitle] = useState('Owner commercial invoice')
  const [invoiceSummary, setInvoiceSummary] = useState('Owner-issued commercial invoice')
  const [invoiceAmount, setInvoiceAmount] = useState('1499')
  const [invoiceCurrency, setInvoiceCurrency] = useState('ZAR')
  const [invoiceBillingMonth, setInvoiceBillingMonth] = useState('2026-03')
  const [invoiceDueDate, setInvoiceDueDate] = useState('2026-03-20')
  const [invoiceNotes, setInvoiceNotes] = useState('Owner console invoice')
  const [invoiceLine1Desc, setInvoiceLine1Desc] = useState('Platform monthly fee')
  const [invoiceLine1Amount, setInvoiceLine1Amount] = useState('1199')
  const [invoiceLine2Desc, setInvoiceLine2Desc] = useState('AI monitoring')
  const [invoiceLine2Amount, setInvoiceLine2Amount] = useState('300')

  async function loadList() {
    const data = await getOwnerTenantCommercialList()
    setItems(data)
    return data
  }

  async function loadSummary(tenantId: number) {
    const data = await getOwnerTenantCommercialSummary(tenantId)
    setSelected(data)
    return data
  }

  async function refreshData(tenantId?: number | null) {
    const targetTenantId = tenantId ?? selectedTenantId

    const data = await loadList()

    if (targetTenantId) {
      await loadSummary(targetTenantId)
      return
    }

    if (data.length > 0) {
      const firstTenantId = data[0].tenantId
      setSelectedTenantId(firstTenantId)
      await loadSummary(firstTenantId)
    }
  }

  async function manualRefresh() {
    if (!isLoggedIn) {
      return
    }

    setRefreshing(true)
    setError('')
    setActionError('')
    setActionMessage('')

    try {
      await refreshData(selectedTenantId)
      setActionMessage('Commercial data refreshed successfully')
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh commercial data')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!isLoggedIn) {
      return
    }

    let active = true

    async function run() {
      setLoading(true)
      setError('')

      try {
        const data = await getOwnerTenantCommercialList()

        if (!active) {
          return
        }

        setItems(data)

        if (data.length > 0) {
          setSelectedTenantId((current) => current ?? data[0].tenantId)
        }
      } catch (err: any) {
        if (!active) {
          return
        }

        setError(err?.message || 'Failed to load owner commercial list')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    run()

    return () => {
      active = false
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn || !selectedTenantId) {
      return
    }

    let active = true

    async function run() {
      setSummaryLoading(true)
      setError('')

      try {
        const data = await getOwnerTenantCommercialSummary(selectedTenantId)

        if (!active) {
          return
        }

        setSelected(data)
      } catch (err: any) {
        if (!active) {
          return
        }

        setError(err?.message || 'Failed to load tenant commercial summary')
      } finally {
        if (active) {
          setSummaryLoading(false)
        }
      }
    }

    run()

    return () => {
      active = false
    }
  }, [isLoggedIn, selectedTenantId])

  const filteredItems = useMemo(() => {
    const value = search.trim().toLowerCase()

    if (!value) {
      return items
    }

    return items.filter((item) => {
      return (
        String(item.tenantName ?? '').toLowerCase().includes(value) ||
        String(item.tenantId ?? '').toLowerCase().includes(value) ||
        String(item.commercialStatus ?? '').toLowerCase().includes(value)
      )
    })
  }, [items, search])

  const selectedTenant = useMemo(() => {
    return items.find((item) => item.tenantId === selectedTenantId) || null
  }, [items, selectedTenantId])

  async function runAction(
    actionKey: string,
    action: () => Promise<any>,
    successMessage: string,
  ) {
    if (!selectedTenantId) {
      setActionError('Select a tenant first')
      return
    }

    setBusyAction(actionKey)
    setActionError('')
    setActionMessage('')

    try {
      await action()
      await refreshData(selectedTenantId)
      setActionMessage(successMessage)
    } catch (err: any) {
      setActionError(err?.message || 'Owner action failed')
    } finally {
      setBusyAction('')
    }
  }

  async function handleAddNote(event: React.FormEvent) {
    event.preventDefault()

    await runAction(
      'note',
      async () => {
        const tags = noteTags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)

        await addOwnerCommercialNote(selectedTenantId!, noteText, tags)
        setNoteText('')
      },
      'Commercial note saved successfully',
    )
  }

  async function handleStatusUpdate(event: React.FormEvent) {
    event.preventDefault()

    await runAction(
      'status',
      async () => {
        await updateOwnerCommercialStatus(selectedTenantId!, statusValue, statusReason)
      },
      'Commercial status updated successfully',
    )
  }

  async function handleOverrideUpdate(event: React.FormEvent) {
    event.preventDefault()

    await runAction(
      'override',
      async () => {
        const features = overrideFeatures
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)

        await updateOwnerSubscriptionOverride(selectedTenantId!, {
          planCode: overridePlanCode,
          planName: overridePlanName,
          billingCycle: overrideBillingCycle,
          price: Number(overridePrice || 0),
          currency: overrideCurrency,
          startsAt: overrideStartsAt,
          endsAt: overrideEndsAt || null,
          features,
          notes: overrideNotes,
        })
      },
      'Subscription override updated successfully',
    )
  }

  async function handleQuoteCreate(event: React.FormEvent) {
    event.preventDefault()

    await runAction(
      'quote',
      async () => {
        await createOwnerQuote(selectedTenantId!, {
          title: quoteTitle,
          summary: quoteSummary,
          amount: Number(quoteAmount || 0),
          currency: quoteCurrency,
          validUntil: quoteValidUntil,
          lines: [
            {
              description: quoteLine1Desc,
              quantity: 1,
              unitPrice: Number(quoteLine1Amount || 0),
              amount: Number(quoteLine1Amount || 0),
            },
            {
              description: quoteLine2Desc,
              quantity: 1,
              unitPrice: Number(quoteLine2Amount || 0),
              amount: Number(quoteLine2Amount || 0),
            },
          ],
          notes: quoteNotes,
          status: 'DRAFT',
        })
      },
      'Quote created successfully',
    )
  }

  async function handleInvoiceCreate(event: React.FormEvent) {
    event.preventDefault()

    await runAction(
      'invoice',
      async () => {
        await createOwnerInvoice(selectedTenantId!, {
          title: invoiceTitle,
          summary: invoiceSummary,
          amount: Number(invoiceAmount || 0),
          currency: invoiceCurrency,
          billingMonth: invoiceBillingMonth,
          dueDate: invoiceDueDate,
          lines: [
            {
              description: invoiceLine1Desc,
              quantity: 1,
              unitPrice: Number(invoiceLine1Amount || 0),
              amount: Number(invoiceLine1Amount || 0),
            },
            {
              description: invoiceLine2Desc,
              quantity: 1,
              unitPrice: Number(invoiceLine2Amount || 0),
              amount: Number(invoiceLine2Amount || 0),
            },
          ],
          notes: invoiceNotes,
          status: 'ISSUED',
        })
      },
      'Invoice created successfully',
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-amber-400/20 bg-amber-500/10 p-8 text-center backdrop-blur-xl">
          <div className="text-sm uppercase tracking-[0.25em] text-amber-200">
            Hidden Owner Console
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            Owner session required
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Open a hidden owner session first, then load the commercial console.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-sky-200">
              Hidden Owner Commercial Console
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Platform commercial oversight
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Signed in as {user?.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={manualRefresh}
              disabled={refreshing}
              className="rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>

            <button
              type="button"
              onClick={logout}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Close owner session
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-6 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {actionError}
          </div>
        ) : null}

        {actionMessage ? (
          <div className="mb-6 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {actionMessage}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3 px-2">
              <div className="text-sm font-medium text-slate-200">
                Tenant commercial list
              </div>
              <div className="text-xs text-slate-400">
                {filteredItems.length} shown
              </div>
            </div>

            <div className="mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tenant, id, or status"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
              />
            </div>

            {loading ? (
              <div className="rounded-[22px] border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-400">
                Loading tenant commercial list...
              </div>
            ) : null}

            <div className="space-y-3">
              {filteredItems.map((item) => {
                const active = item.tenantId === selectedTenantId

                return (
                  <button
                    key={item.tenantId}
                    type="button"
                    onClick={() => setSelectedTenantId(item.tenantId)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      active
                        ? 'border-sky-400/40 bg-sky-500/10'
                        : 'border-white/10 bg-slate-900/50 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">
                          {item.tenantName}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Tenant #{item.tenantId}
                        </div>
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                        {item.commercialStatus || 'UNKNOWN'}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                      <div>Notes: {item.counts?.notes ?? 0}</div>
                      <div>Quotes: {item.counts?.quotes ?? 0}</div>
                      <div>Invoices: {item.counts?.invoices ?? 0}</div>
                    </div>
                  </button>
                )
              })}

              {!loading && filteredItems.length === 0 ? (
                <div className="rounded-[22px] border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-400">
                  No tenants match your search.
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              {summaryLoading ? (
                <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-6 text-sm text-slate-400">
                  Loading tenant commercial summary...
                </div>
              ) : null}

              {!summaryLoading && selected ? (
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.25em] text-sky-200">
                          Selected tenant
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {selected.tenantName}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          Tenant #{selected.tenantId}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                          Status: {selected.commercialStatus || 'UNKNOWN'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                          Notes: {selected.counts?.notes ?? 0}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                          Quotes: {selected.counts?.quotes ?? 0}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                          Invoices: {selected.counts?.invoices ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
                      <div className="text-sm text-slate-400">Status reason</div>
                      <div className="mt-2 text-sm leading-6 text-white">
                        {selected.commercialStatusReason || 'No status reason recorded'}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
                      <div className="text-sm text-slate-400">Updated at</div>
                      <div className="mt-2 text-sm leading-6 text-white break-all">
                        {selected.updatedAt || 'N/A'}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
                      <div className="text-sm text-slate-400">Latest quote</div>
                      <div className="mt-2 text-base font-medium text-white">
                        {selected.latestQuote?.title || 'No quote yet'}
                      </div>
                      <div className="mt-2 text-sm text-slate-400">
                        {selected.latestQuote?.summary || 'No quote summary recorded'}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5">
                      <div className="text-sm text-slate-400">Latest invoice</div>
                      <div className="mt-2 text-base font-medium text-white">
                        {selected.latestInvoice?.title || 'No invoice yet'}
                      </div>
                      <div className="mt-2 text-sm text-slate-400">
                        {selected.latestInvoice?.summary || 'No invoice summary recorded'}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5 xl:col-span-2">
                      <div className="text-sm text-slate-400">Latest commercial note</div>
                      <div className="mt-2 text-sm leading-6 text-white">
                        {selected.latestCommercialNote?.note || 'No commercial note yet'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <form onSubmit={handleAddNote} className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="mb-4 text-sm font-medium text-white">Add commercial note</div>

                <div className="space-y-4">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Enter owner commercial note"
                    className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                  />
                  <input
                    value={noteTags}
                    onChange={(e) => setNoteTags(e.target.value)}
                    placeholder="owner,commercial"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                  />
                  <button
                    type="submit"
                    disabled={busyAction === 'note' || !selectedTenantId || !noteText.trim()}
                    className="rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === 'note' ? 'Saving note...' : 'Save note'}
                  </button>
                </div>
              </form>

              <form onSubmit={handleStatusUpdate} className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="mb-4 text-sm font-medium text-white">Update status</div>

                <div className="space-y-4">
                  <select
                    value={statusValue}
                    onChange={(e) => setStatusValue(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ON_HOLD">ON_HOLD</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>

                  <textarea
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Enter status reason"
                    className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                  />

                  <button
                    type="submit"
                    disabled={busyAction === 'status' || !selectedTenantId}
                    className="rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === 'status' ? 'Updating status...' : 'Update status'}
                  </button>
                </div>
              </form>

              <form onSubmit={handleOverrideUpdate} className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="mb-4 text-sm font-medium text-white">Subscription override</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <input value={overridePlanCode} onChange={(e) => setOverridePlanCode(e.target.value)} placeholder="Plan code" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={overridePlanName} onChange={(e) => setOverridePlanName(e.target.value)} placeholder="Plan name" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={overrideBillingCycle} onChange={(e) => setOverrideBillingCycle(e.target.value)} placeholder="Billing cycle" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} placeholder="Price" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={overrideCurrency} onChange={(e) => setOverrideCurrency(e.target.value)} placeholder="Currency" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={overrideStartsAt} onChange={(e) => setOverrideStartsAt(e.target.value)} placeholder="Starts at" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={overrideEndsAt} onChange={(e) => setOverrideEndsAt(e.target.value)} placeholder="Ends at" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <textarea value={overrideFeatures} onChange={(e) => setOverrideFeatures(e.target.value)} placeholder="feature1,feature2" className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <textarea value={overrideNotes} onChange={(e) => setOverrideNotes(e.target.value)} placeholder="Notes" className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                </div>

                <button
                  type="submit"
                  disabled={busyAction === 'override' || !selectedTenantId}
                  className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === 'override' ? 'Saving override...' : 'Save override'}
                </button>
              </form>

              <form onSubmit={handleQuoteCreate} className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="mb-4 text-sm font-medium text-white">Create quote</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <input value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} placeholder="Quote title" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <textarea value={quoteSummary} onChange={(e) => setQuoteSummary(e.target.value)} placeholder="Quote summary" className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <input value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} placeholder="Amount" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={quoteCurrency} onChange={(e) => setQuoteCurrency(e.target.value)} placeholder="Currency" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} placeholder="Valid until" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <input value={quoteLine1Desc} onChange={(e) => setQuoteLine1Desc(e.target.value)} placeholder="Line 1 description" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={quoteLine1Amount} onChange={(e) => setQuoteLine1Amount(e.target.value)} placeholder="Line 1 amount" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={quoteLine2Desc} onChange={(e) => setQuoteLine2Desc(e.target.value)} placeholder="Line 2 description" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={quoteLine2Amount} onChange={(e) => setQuoteLine2Amount(e.target.value)} placeholder="Line 2 amount" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} placeholder="Quote notes" className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                </div>

                <button
                  type="submit"
                  disabled={busyAction === 'quote' || !selectedTenantId}
                  className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === 'quote' ? 'Creating quote...' : 'Create quote'}
                </button>
              </form>

              <form onSubmit={handleInvoiceCreate} className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl xl:col-span-2">
                <div className="mb-4 text-sm font-medium text-white">Create invoice</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <input value={invoiceTitle} onChange={(e) => setInvoiceTitle(e.target.value)} placeholder="Invoice title" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <textarea value={invoiceSummary} onChange={(e) => setInvoiceSummary(e.target.value)} placeholder="Invoice summary" className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                  <input value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="Amount" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceCurrency} onChange={(e) => setInvoiceCurrency(e.target.value)} placeholder="Currency" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceBillingMonth} onChange={(e) => setInvoiceBillingMonth(e.target.value)} placeholder="Billing month" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} placeholder="Due date" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceLine1Desc} onChange={(e) => setInvoiceLine1Desc(e.target.value)} placeholder="Line 1 description" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceLine1Amount} onChange={(e) => setInvoiceLine1Amount(e.target.value)} placeholder="Line 1 amount" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceLine2Desc} onChange={(e) => setInvoiceLine2Desc(e.target.value)} placeholder="Line 2 description" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <input value={invoiceLine2Amount} onChange={(e) => setInvoiceLine2Amount(e.target.value)} placeholder="Line 2 amount" className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60" />
                  <textarea value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="Invoice notes" className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60 md:col-span-2" />
                </div>

                <button
                  type="submit"
                  disabled={busyAction === 'invoice' || !selectedTenantId}
                  className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === 'invoice' ? 'Creating invoice...' : 'Create invoice'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
