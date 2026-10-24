import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasOwnerSession } from '../lib/ownerSession'

export function useOwnerRouteGuard(options?: {
  requireSession?: boolean
  redirectTo?: string
  redirectIfLoggedIn?: boolean
  loggedInRedirectTo?: string
}) {
  const navigate = useNavigate()

  const requireSession = options?.requireSession ?? false
  const redirectTo = options?.redirectTo ?? '/owner/hidden-login'
  const redirectIfLoggedIn = options?.redirectIfLoggedIn ?? false
  const loggedInRedirectTo = options?.loggedInRedirectTo ?? '/owner/hidden-commercial'

  useEffect(() => {
    const loggedIn = hasOwnerSession()

    if (requireSession && !loggedIn) {
      navigate(redirectTo, { replace: true })
      return
    }

    if (redirectIfLoggedIn && loggedIn) {
      navigate(loggedInRedirectTo, { replace: true })
    }
  }, [navigate, requireSession, redirectTo, redirectIfLoggedIn, loggedInRedirectTo])
}
