import { api, clearToken, setToken } from "./client";

// ── Login ─────────────────────────────────────────────────────────────────

export type LoginResponse = {
  access_token: string;
  user?: {
    id: number;
    email: string;
    role: string;
    companyId?: number | null;
  };
};

export async function login(email: string, password: string) {
  const res = await api.post<LoginResponse>("/auth/login", { email, password });
  if (res.data?.access_token) setToken(res.data.access_token);
  return res.data;
}

export function logout() {
  clearToken();
}

// ── Register / request access ─────────────────────────────────────────────

export type RegisterPayload = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  password: string;
};

export type RegisterResponse = {
  /** The new tenant user's id. */
  id?: number | string;
  /** The new tenant company's id. */
  companyId?: number | string;
  /** Human-readable confirmation message from the backend. */
  message?: string;
};

/**
 * Submits a new-tenant registration request to `POST /auth/register`.
 * The backend creates a pending user + company and notifies the platform
 * owner for approval. The user cannot log in until the account is activated.
 *
 * Throws an `ApiError` (from `api/client.ts`) on 4xx/5xx so callers can
 * read `error.message` for a user-facing description.
 */
export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>("/auth/register", payload);
  return res.data;
}
