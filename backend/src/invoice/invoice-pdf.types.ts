export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string;
};

export type InvoiceParty = {
  name: string;
  addressLines?: string[];
  vatNumber?: string;
  registrationNumber?: string;
  email?: string;
  phone?: string;
};

export type BankingDetails = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branchCode?: string;
};

export type InvoicePdfModel = {
  invoiceNumber: string;
  createdAt?: Date | string;
  dueDate?: Date | string;
  status?: InvoiceStatus;

  seller: InvoiceParty;
  buyer: InvoiceParty;

  // ✅ SaaS-ready fields (safe + optional)
  sellerLogoPath?: string | null;
  paymentTerms?: string;

  items: InvoiceLineItem[];

  currency?: string;
  reference?: string;
  notes?: string;

  subtotal?: number;
  vatRate?: number;
  vatAmount?: number;
  total?: number;

  banking?: BankingDetails;
};