import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOwnerSession } from '../../hooks/useOwnerSession'
import { useOwnerRouteGuard } from '../../hooks/useOwnerRouteGuard'

export default function OwnerLoginPage() {
  useOwnerRouteGuard({
    redirectIfLoggedIn: true,
    loggedInRedirectTo: '/owner/hidden-commercial',
  })

  const navigate = useNavigate()
  const { login, isLoggedIn, user, logout } = useOwnerSession()

  const [email, setEmail] = useState('flowopsaas@gmail.com')
  const [password, setPassword] = useState('2026FlowOps!')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const session = await login(email, password)
      setSuccess(`Owner session opened for ${session.user.email}`)
      navigate('/owner/hidden-commercial')
    } catch (err: any) {
      setError(err?.message || 'Owner login failed')
    } finally {
      setLoading(false)
    }
  }

  function openCommercialConsole() {
    navigate('/owner/hidden-commercial')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-10">
        <div className="grid w-full gap-8 lg:grid-cols-2">
          <div className="rounded-[28px] border border-sky-500/20 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6">
              <div className="mb-3 inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-sky-200 uppercase">
                Hidden Owner Access
              </div>

              <h1 className="text-3xl font-semibold tracking-tight text-white">
                FlowOps Super Admin
              </h1>

              <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
                Secure hidden owner session for platform-level commercial control.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Owner email
                </label>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Owner password
                </label>
                <input
                  type="password"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Opening owner session...' : 'Open hidden owner session'}
              </button>
            </form>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            ) : null}

            {isLoggedIn && user ? (
              <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
                <div className="text-sm text-slate-300">Active owner session</div>
                <div className="mt-2 text-lg font-semibold text-white">{user.name}</div>
                <div className="mt-1 text-sm text-slate-400">{user.email}</div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {user.roles?.map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-200"
                    >
                      {role}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openCommercialConsole}
                    className="rounded-2xl border border-sky-400/30 bg-sky-500/20 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/30"
                  >
                    Open hidden commercial console
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
            ) : null}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-sky-500/10 via-slate-900/70 to-slate-950/80 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-xs uppercase tracking-[0.25em] text-sky-200">
              Commercial Control Layer
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-slate-400">Secure hidden role</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Owner / Super Admin
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-slate-400">Available backend</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  Owner commercial read routes and mutation routes are already live.
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-slate-400">Current stage</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  Hidden owner login is protected and redirects to the hidden commercial console when a session already exists.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
