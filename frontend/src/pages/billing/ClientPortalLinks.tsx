import { useEffect, useState } from 'react'
import {
  createTenantPortalLink,
  getTenantMyCompany,
  getTenantPortalLinks,
} from '../../api/tenantAdminCoreOps'

export default function ClientPortalLinks() {
  const [company, setCompany] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadData() {
    const companyData = await getTenantMyCompany()
    setCompany(companyData)

    const links = await getTenantPortalLinks()
    setItems(links)
  }

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      setError('')

      try {
        const companyData = await getTenantMyCompany()
        const links = await getTenantPortalLinks()

        if (!active) {
          return
        }

        setCompany(companyData)
        setItems(links)
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Failed to load portal links')
        }
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
  }, [])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()

    if (!company?.id) {
      setError('Company context not available')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const result = await createTenantPortalLink({
        companyId: company.id,
        clientName,
      })

      if (result?.ok === false) {
        setError(result?.message || 'Portal link creation failed')
      } else {
        setMessage('Portal link created successfully')
        setClientName('')
        await loadData()
      }
    } catch (err: any) {
      setError(err?.message || 'Portal link creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="text-xs uppercase tracking-[0.25em] text-sky-200">
          Client Portal Links
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Booking portal access
        </h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      <form
        onSubmit={handleCreate}
        className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client name"
            className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
          />
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            Company: {company?.name || 'Unknown'}
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Creating link...' : 'Create portal link'}
        </button>
      </form>

      <div className="grid gap-4">
        {loading ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
            Loading portal links...
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
            No portal links found.
          </div>
        ) : null}

        {items.map((item, index) => (
          <div
            key={item?.id ?? item?.token ?? index}
            className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
          >
            <div className="text-base font-medium text-white">
              {item?.clientName || item?.name || 'Portal link'}
            </div>
            <div className="mt-2 break-all text-sm text-slate-300">
              {item?.url || item?.token || JSON.stringify(item)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
