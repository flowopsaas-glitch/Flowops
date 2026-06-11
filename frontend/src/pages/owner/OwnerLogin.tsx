import { FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type OwnerLoginResponse = {
  accessToken?: string
  token?: string
  refreshToken?: string
  message?: string
}

const OWNER_API_URL =
  (import.meta as any)?.env?.VITE_API_URL?.replace(/\/$/, '') ||
  'http://localhost:3000/api/v1'

export default function OwnerLogin() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('flowopsaas@gmail.com')
  const [accessKey, setAccessKey] = useState('2026FlowOps!')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const endpoint = useMemo(() => {
    return `${OWNER_API_URL}/owner/auth/login`
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        email: email.trim(),
        password: accessKey,
        accessKey,
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      let data: OwnerLoginResponse = {}

      try {
        data = await response.json()
      } catch {
        data = {}
      }

      if (!response.ok) {
        const message =
          data?.message ||
          'Owner login failed. Please verify the hidden owner credentials.'
        throw new Error(message)
      }

      const token = data?.accessToken || data?.token || ''

      if (!token) {
        throw new Error('Owner login succeeded but no access token was returned.')
      }

      localStorage.setItem('ownerAccessToken', token)
      localStorage.setItem('flowops_owner_token', token)
      localStorage.setItem(
        'flowops_owner_auth',
        JSON.stringify({
          email: email.trim(),
          type: 'owner',
          role: 'SUPER_ADMIN',
          accessToken: token,
          refreshToken: data?.refreshToken || '',
          loggedInAt: new Date().toISOString(),
        }),
      )

      setSuccess('Owner login successful. Redirecting to owner console...')

      window.dispatchEvent(new Event('storage'))

      setTimeout(() => {
        navigate('/owner/console', { replace: true })
      }, 350)
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background:
          'radial-gradient(circle at top, rgba(78,126,255,0.18), transparent 30%), linear-gradient(180deg, #061120 0%, #08182b 45%, #0b1f38 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          borderRadius: '24px',
          padding: '28px',
          background: 'rgba(11, 28, 52, 0.76)',
          border: '1px solid rgba(151, 182, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(18px)',
          color: '#e8f1ff',
        }}
      >
        <div style={{ marginBottom: '22px' }}>
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#8fb4ff',
              marginBottom: '10px',
            }}
          >
            FlowOps Hidden Owner Access
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: '30px',
              lineHeight: 1.1,
              fontWeight: 700,
              color: '#f5f9ff',
            }}
          >
            Super Admin Login
          </h1>

          <p
            style={{
              marginTop: '10px',
              marginBottom: 0,
              color: 'rgba(223, 235, 255, 0.78)',
              fontSize: '14px',
              lineHeight: 1.6,
            }}
          >
            Hidden platform owner access only.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label
              htmlFor="owner-email"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                color: '#bcd1ff',
              }}
            >
              Email
            </label>

            <input
              id="owner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '14px',
                border: '1px solid rgba(150, 180, 255, 0.20)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#f4f8ff',
                padding: '0 14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="owner-access-key"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                color: '#bcd1ff',
              }}
            >
              Access Key
            </label>

            <input
              id="owner-access-key"
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              autoComplete="current-password"
              required
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '14px',
                border: '1px solid rgba(150, 180, 255, 0.20)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#f4f8ff',
                padding: '0 14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error ? (
            <div
              style={{
                borderRadius: '14px',
                padding: '12px 14px',
                background: 'rgba(255, 107, 107, 0.10)',
                border: '1px solid rgba(255, 107, 107, 0.22)',
                color: '#ffd0d0',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div
              style={{
                borderRadius: '14px',
                padding: '12px 14px',
                background: 'rgba(84, 214, 124, 0.10)',
                border: '1px solid rgba(84, 214, 124, 0.22)',
                color: '#d9ffe5',
                fontSize: '13px',
              }}
            >
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: '50px',
              border: 'none',
              borderRadius: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              color: '#061120',
              background: 'linear-gradient(135deg, #d9e8ff 0%, #8bb7ff 100%)',
              opacity: loading ? 0.8 : 1,
              boxShadow: '0 16px 34px rgba(84, 132, 255, 0.24)',
            }}
          >
            {loading ? 'Signing in...' : 'Open Owner Console'}
          </button>
        </form>
      </div>
    </div>
  )
}
