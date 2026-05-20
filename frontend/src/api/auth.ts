import api from '../lib/api';

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name?: string;
    // any additional fields returned by your backend
  };
}

/**
 * Login user with email + password
 */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await api.post('/auth/login', payload);
  return response.data;
}

/**
 * Optionally: logout on server (if backend supports it)
 */
export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}
