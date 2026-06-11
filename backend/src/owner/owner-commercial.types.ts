export type OwnerTenantCommercialStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED';

export interface OwnerTenantStatusBody {
  status: OwnerTenantCommercialStatus | 'RESTORED';
  reason?: string;
  note?: string;
}

export interface OwnerTenantSubscriptionOverrideBody {
  planCode?: string;
  planName?: string;
  billingCycle?: 'MONTHLY' | 'ANNUAL' | 'CUSTOM' | string;
  price?: number;
  currency?: string;
  startsAt?: string;
  endsAt?: string;
  features?: string[];
  notes?: string;
}

export interface OwnerTenantQuoteLine {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

export interface OwnerTenantQuoteBody {
  title: string;
  summary?: string;
  amount: number;
  currency?: string;
  validUntil?: string;
  lines?: OwnerTenantQuoteLine[];
  notes?: string;
}

export interface OwnerTenantInvoiceLine {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

export interface OwnerTenantInvoiceBody {
  title: string;
  summary?: string;
  amount: number;
  currency?: string;
  billingMonth?: string;
  dueDate?: string;
  lines?: OwnerTenantInvoiceLine[];
  notes?: string;
}

export interface OwnerTenantCommercialNoteBody {
  note: string;
  tags?: string[];
}

export interface OwnerCommercialAuditEntry {
  id: string;
  at: string;
  action: string;
  tenantId: number;
  tenantName: string;
  actorEmail?: string;
  actorRole?: string;
  payload?: Record<string, unknown>;
}

export interface OwnerTenantCommercialState {
  tenantId: number;
  tenantName: string;
  status: OwnerTenantCommercialStatus;
  statusReason?: string;
  statusChangedAt?: string;
  commercialNotes: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  subscriptionOverride?: Record<string, unknown>;
  updatedAt: string;
}

export interface OwnerCommercialControlStore {
  tenants: Record<string, OwnerTenantCommercialState>;
}
