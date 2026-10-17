import { api } from "./client";

export type SsoConfig = {
  companyId?: string;
  provider: string;
  enabled: boolean;
  issuer?: string | null;
  clientId?: string | null;
  clientSecretSet?: boolean;
  scopes?: string | null;
  allowedDomain?: string | null;
  autoProvision?: boolean;
  defaultRole?: string;
  redirectUri?: string;
  lastLoginAt?: string | null;
};

export type SsoConfigInput = {
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  allowedDomain?: string;
  autoProvision?: boolean;
  defaultRole?: string;
};

const unwrap = (r: any) => r?.data ?? r;

export async function getSsoConfig(): Promise<SsoConfig> {
  return unwrap(await api.get("/sso/config"));
}

export async function saveSsoConfig(dto: SsoConfigInput): Promise<SsoConfig> {
  return unwrap(await api.put("/sso/config", dto));
}

/** Public: check whether an email's domain has SSO configured. */
export async function lookupSso(email: string): Promise<{ sso: boolean; startUrl?: string }> {
  return unwrap(await api.get(`/sso/lookup?email=${encodeURIComponent(email)}`));
}

export async function exchangeSsoCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  user: unknown;
}> {
  return unwrap(await api.post('/sso/exchange', { code }));
}
