// Shared types for the AI Accounting Bridge providers (Xero / Sage / Pastel).

export interface AccountingLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode?: string;
  taxType?: string;
}

export interface AccountingDoc {
  id: string;
  number: string;
  clientName: string;
  clientEmail?: string | null;
  date: Date;
  dueDate?: Date | null;
  reference?: string;
  lineItems: AccountingLineItem[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresInSec?: number;
  tenantId?: string | null;
  tenantName?: string | null;
}

export interface PushResult {
  externalId: string;
  raw?: any;
}

/** A connection row passed to providers (subset of the Prisma model). */
export interface ProviderConnection {
  id: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  externalTenantId?: string | null;
  settings?: any;
}

/** Implemented by each accounting provider adapter. */
export interface AccountingProviderAdapter {
  readonly key: 'XERO' | 'SAGE' | 'PASTEL';
  readonly name: string;
  readonly usesOAuth: boolean;

  /** Whether the provider's app credentials are present in env. */
  isConfigured(): boolean;

  // OAuth (Xero/Sage). Pastel implements none of these.
  getAuthUrl?(state: string): string;
  exchangeCode?(code: string): Promise<OAuthTokens>;
  refresh?(refreshToken: string): Promise<OAuthTokens>;

  pushInvoice(conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult>;
  pushCreditNote(conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult>;
}
