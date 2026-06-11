import type { OwnerLoginResponse, OwnerUser } from './ownerApi'

const OWNER_ACCESS_TOKEN_KEY = 'flowops.owner.accessToken'
const OWNER_USER_KEY = 'flowops.owner.user'

export function setOwnerSession(session: OwnerLoginResponse) {
  localStorage.setItem(OWNER_ACCESS_TOKEN_KEY, session.accessToken)
  localStorage.setItem(OWNER_USER_KEY, JSON.stringify(session.user))
}

export function clearOwnerSession() {
  localStorage.removeItem(OWNER_ACCESS_TOKEN_KEY)
  localStorage.removeItem(OWNER_USER_KEY)
}

export function getOwnerAccessToken(): string | null {
  return localStorage.getItem(OWNER_ACCESS_TOKEN_KEY)
}

export function getOwnerUser(): OwnerUser | null {
  const raw = localStorage.getItem(OWNER_USER_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as OwnerUser
  } catch {
    return null
  }
}

export function hasOwnerSession() {
  return !!getOwnerAccessToken()
}
