import { api, clearToken, setToken } from "./client";

// ── Shared response shape ─────────────────────────────────────────────────
//
// The backend's TransformInterceptor wraps every response as:
//   { data: <payload>, statusCode: number, message: string }
//
// The `api` client's response interceptor does `return response.data`, which
// strips the outer AxiosResponse wrapper and returns the HTTP body directly.
// So `await api.post('/auth/login')` returns the full body object:
//   { data: { access_token, user }, statusCode, message }
//
// Therefore `res.data` gives the inner payload { access_token, user }.
// All helpers below follow this pattern.

// ── Login ─────────────────────────────────────────────────────────────────

export type LoginResponse = {
  access_token: string;
  refresh_token?: string;
  user?: {
    id: string;
    email: string;
    role: string;
    companyId?: string | null;
    name?: string;
    company?: {
      id: string;
      name: string;
      logoUrl?: string | null;
      primaryColor?: string | null;
      plan?: string;
    };
  };
};

/** Tenant login. Stores the access token in lib/session.ts. */
export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", { email, password });
  if (res.data?.access_token) setToken(res.data.access_token);
  return res.data;
}

/** Platform owner login. Uses the same endpoint shape as tenant login. */
export async function ownerLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/owner-login", {
    email,
    password,
  });
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
 * The backend creates a pending ApprovalRequest. The platform owner
 * approves it before the user can log in.
 *
 * Throws an `ApiError` (from `api/client.ts`) on 4xx/5xx so callers can
 * read `error.message` for a user-facing description.
 */
export async function register(
  payload: RegisterPayload,
): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>("/auth/register", payload);
  return res.data;
}
