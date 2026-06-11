import { api, clearToken, setToken } from "./client";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
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
  const res = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
  });

  if (res.data?.access_token) {
    setToken(res.data.access_token);
  }

  return res.data;
}

export function logout() {
  clearToken();
}
