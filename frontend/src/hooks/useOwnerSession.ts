import { useMemo, useState } from 'react'
import {
  clearOwnerSession,
  getOwnerAccessToken,
  getOwnerUser,
  hasOwnerSession,
  setOwnerSession,
} from '../lib/ownerSession'
import { ownerLogin, type OwnerLoginResponse } from '../lib/ownerApi'

export function useOwnerSession() {
  const [accessToken, setAccessToken] = useState<string | null>(() => getOwnerAccessToken())
  const [user, setUser] = useState(() => getOwnerUser())

  const isLoggedIn = useMemo(() => {
    return !!accessToken && hasOwnerSession()
  }, [accessToken])

  async function login(email: string, password: string) {
    const session: OwnerLoginResponse = await ownerLogin(email, password)

    setOwnerSession(session)
    setAccessToken(session.accessToken)
    setUser(session.user)

    return session
  }

  function logout() {
    clearOwnerSession()
    setAccessToken(null)
    setUser(null)
  }

  return {
    accessToken,
    user,
    isLoggedIn,
    login,
    logout,
  }
}
