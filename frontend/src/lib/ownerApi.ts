export type OwnerUser = {
  id: string
  email: string
  name: string
  role: string
  roles: string[]
  tenantId: number | null
  companyId: number | null
  type: string
  scope: string
}

export type OwnerLoginResponse = {
  accessToken: string
  user: OwnerUser
}

const OWNER_API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.trim?.() ||
  'http://127.0.0.1:3000/api'

export function getOwnerApiBase() {
  return OWNER_API_BASE.replace(/\/+$/, '')
}

async function parseJsonSafe(response: Response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

export async function ownerLogin(email: string, password: string): Promise<OwnerLoginResponse> {
  const response = await fetch(`${getOwnerApiBase()}/auth/owner-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  const data = await parseJsonSafe(response)

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      'Owner login failed'

    throw new Error(String(message))
  }

  return data as OwnerLoginResponse
}

export async function ownerGetMe(accessToken: string) {
  const response = await fetch(`${getOwnerApiBase()}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const data = await parseJsonSafe(response)

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      'Owner session check failed'

    throw new Error(String(message))
  }

  return data
}
