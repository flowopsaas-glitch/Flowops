import { useEffect, useState, useMemo } from 'react'
import {
  Bell, BellOff, CheckCheck, AlertTriangle, Truck, FileText,
  MessageSquare, Sparkles, Info, RefreshCw, Filter, Clock,
  CheckCircle2, ArrowUpRight, X
} from 'lucide-react'
import { api } from '../api/client'

type NotificationItem = {
  id: string
  title: string
  body?: string | null
  type?: string | null
  read: boolean
  readAt?: string | null
  createdAt: string
  companyId?: string | null
}

type FilterTab = 'all' | 'unread'

// Notification type metadata
const TYPE_META: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  STATUS_UPDATE:  { icon: Truck,         color: 'text-sky-400 bg-sky-400/10 border-sky-400/20',      label: 'Status Update'  },
  AI_ALERT:       { icon: Sparkles,      color: 'text-violet-400 bg-violet-400/10 border-violet-400/20', label: 'AI Alert'   },
  BILLING:        { icon: FileText,      color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',  label: 'Billing'       },
  EXCEPTION:      { icon: AlertTriangle, color: 'text-rose-400 bg-rose-400/10 border-rose-400/20',    label: 'Exception'     },
  MESSAGE:        { icon: MessageSquare, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Message'},
  INFO:           { icon: Info,          color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',    label: 'Info'          },
  DEFAULT:        { icon: Bell,          color: 'text-white/60 bg-white/5 border-white/10',           label: 'Notification'  },
}

function getTypeMeta(type?: string | null) {
  if (!type) return TYPE_META.DEFAULT
  const upper = type.toUpperCase()
  // fuzzy match
  for (const [key, meta] of Object.entries(TYPE_META)) {
    if (upper.includes(key)) return meta
  }
  return TYPE_META.DEFAULT
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function unwrapList(raw: any): NotificationItem[] {
  const data = raw?.data ?? raw
  return Array.isArray(data) ? data : []
}

export default function Notifications() {
  const [items, setItems]       = useState<NotificationItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState<FilterTab>('all')
  const [marking, setMarking]   = useState(false)
  const [toast, setToast]       = useState('')

  // ── data loading ────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    setError('')
    try {
      const raw: any = await api.get('/notifications')
      setItems(unwrapList(raw))
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  // ── actions ─────────────────────────────────────────────────────────────────
  async function handleMarkRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`)
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
    } catch {
      // silent — UI already updated optimistically on click
    }
  }

  async function handleMarkAllRead() {
    setMarking(true)
    try {
      await api.post('/notifications/mark-all-read')
      setItems(prev => prev.map(n => ({ ...n, read: true, readAt: new Date().toISOString() })))
      setToast('All notifications marked as read')
      setTimeout(() => setToast(''), 3000)
    } catch (err: any) {
      setError(err?.message || 'Failed to mark all as read')
    } finally {
      setMarking(false)
    }
  }

  // ── derived state ────────────────────────────────────────────────────────────
  const unreadCount = useMemo(() => items.filter(n => !n.read).length, [items])

  const visible = useMemo(() => {
    if (tab === 'unread') return items.filter(n => !n.read)
    return items
  }, [items, tab])

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(90,70,160,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[900px] space-y-6">

        {/* ── Header ── */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <Bell className="h-3.5 w-3.5" />
                Notification Centre
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-3 inline-flex items-center justify-center rounded-full bg-rose-500 px-2.5 py-0.5 text-sm font-black text-white min-w-[28px]">
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="mt-1.5 text-sm text-white/55">
                {unreadCount === 0
                  ? 'All caught up — no unread notifications'
                  : `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''} require${unreadCount === 1 ? 's' : ''} your attention`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => void load()}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={() => void handleMarkAllRead()}
                  disabled={marking}
                  className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  <CheckCheck className="h-4 w-4" />
                  {marking ? 'Marking...' : 'Mark all read'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Toast ── */}
        {toast && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {toast}
            </div>
            <button onClick={() => setToast('')} className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center justify-between rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
            <button onClick={() => setError('')} className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Filter Tabs ── */}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 w-fit">
          {(['all', 'unread'] as FilterTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all capitalize ${
                tab === t
                  ? 'bg-white/15 text-white shadow-lg'
                  : 'text-white/45 hover:text-white hover:bg-white/5'
              }`}
            >
              {t === 'unread' ? <Filter className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
              {t === 'all' ? `All (${items.length})` : `Unread (${unreadCount})`}
            </button>
          ))}
        </div>

        {/* ── Notification List ── */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-[24px] border border-white/5 bg-white/5 p-5 h-[88px]" />
            ))
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/3 py-16 text-center">
              <BellOff className="h-10 w-10 text-white/20 mb-3" />
              <p className="text-white/40 font-semibold">
                {tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="mt-1 text-xs text-white/25">
                {tab === 'unread' ? 'All caught up!' : 'Activity will appear here as it happens'}
              </p>
            </div>
          ) : (
            visible.map((item) => {
              const meta = getTypeMeta(item.type)
              const Icon = meta.icon
              return (
                <div
                  key={item.id}
                  className={`group relative rounded-[24px] border p-5 transition-all ${
                    item.read
                      ? 'border-white/8 bg-white/4 hover:bg-white/6'
                      : 'border-white/15 bg-white/8 hover:bg-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.25)]'
                  }`}
                >
                  {/* Unread dot */}
                  {!item.read && (
                    <span className="absolute top-5 right-5 h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                  )}

                  <div className="flex items-start gap-4 pr-6">
                    {/* Type icon */}
                    <div className={`mt-0.5 flex-shrink-0 rounded-xl border p-2.5 ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-white leading-tight">
                          {item.title || item.type || 'Notification'}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>

                      {(item.body) && (
                        <p className="mt-1.5 text-sm text-white/60 leading-relaxed line-clamp-2">
                          {item.body}
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs text-white/35">
                          <Clock className="h-3 w-3" />
                          {timeAgo(item.createdAt)}
                          {item.read && item.readAt && (
                            <span className="ml-2 flex items-center gap-1 text-emerald-400/60">
                              <CheckCircle2 className="h-3 w-3" />
                              Read {timeAgo(item.readAt)}
                            </span>
                          )}
                        </div>

                        {!item.read && (
                          <button
                            onClick={() => void handleMarkRead(item.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Footer summary ── */}
        {!loading && items.length > 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4 flex items-center justify-between text-sm text-white/40">
            <span>{items.length} total · {items.filter(n => n.read).length} read · {unreadCount} unread</span>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Showing {visible.length}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
