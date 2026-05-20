import { useEffect, useState } from 'react'
import {
  getTenantNotifications,
  markTenantNotificationRead,
} from '../api/tenantAdminCoreOps'

export default function Notifications() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadData() {
    const data = await getTenantNotifications()
    setItems(data)
  }

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      setError('')

      try {
        const data = await getTenantNotifications()
        if (active) {
          setItems(data)
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Failed to load notifications')
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

  async function handleMarkRead(id: string | number) {
    setMessage('')
    setError('')

    const result = await markTenantNotificationRead(id)

    if (result?.ok === false) {
      setError('Failed to mark notification as read')
      return
    }

    await loadData()
    setMessage('Notification updated')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="text-xs uppercase tracking-[0.25em] text-sky-200">
          Notifications
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Notification center
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

      <div className="grid gap-4">
        {loading ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
            Loading notifications...
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
            No notifications available.
          </div>
        ) : null}

        {items.map((item, index) => (
          <div
            key={item?.id ?? index}
            className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-medium text-white">
                  {item?.title || item?.type || 'Notification'}
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  {item?.message || item?.body || 'No message'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleMarkRead(item?.id)}
                className="rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/30"
              >
                Mark read
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
