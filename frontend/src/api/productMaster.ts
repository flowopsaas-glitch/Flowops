import { api } from './client';

/**
 * Product / Variant / SKU master-data API client.
 *
 * The tenant is derived from the access token server-side. SKUs are allocated
 * by the server from a tenant-scoped, never-reused sequence — the UI never
 * invents one.
 */

export type ProductStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETIRED';
export type VariantStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETIRED';
export type AliasType = 'BARCODE' | 'SUPPLIER_CODE' | 'CUSTOMER_CODE' | 'INTERNAL' | 'LEGACY';

export type ProductVariant = {
  id: string;
  productId: string;
  code: string;
  name: string;
  description?: string | null;
  attributes: Record<string, unknown>;
  attributeFingerprint: string;
  sku?: string | null;
  skuAllocatedAt?: string | null;
  status: VariantStatus;
  approvedAt?: string | null;
  weightKg?: number | null;
  volumeCbm?: number | null;
  dimensions?: string | null;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  revision: number;
  product?: { code: string; name: string; status: ProductStatus } | null;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  brand?: string | null;
  unitOfMeasure: string;
  status: ProductStatus;
  approvedAt?: string | null;
  revision: number;
  attributeFingerprint?: string | null;
  isHazardous: boolean;
  requiresBatchTracking: boolean;
  requiresSerialTracking: boolean;
  variants?: ProductVariant[];
  aliases?: ProductAlias[];
  _count?: { variants: number };
  possibleDuplicate?: { id: string; code: string; name: string } | null;
  createdAt: string;
};

export type ProductAlias = {
  id: string;
  type: AliasType;
  value: string;
  productId?: string | null;
  variantId?: string | null;
  supplierRef?: string | null;
  customerRef?: string | null;
  isActive: boolean;
};

export type MasterDataAuditEvent = {
  id: string;
  eventType: string;
  actorId: string;
  actorName?: string | null;
  description: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  createdAt: string;
};

export const productMasterApi = {
  isEnabled: () => api.get<{ enabled: boolean }>('/product-master/enabled').then((r) => r.data),

  listProducts: (params?: { status?: string; search?: string }) =>
    api.get<Product[]>('/product-master/products', { params }).then((r) => r.data),

  createProduct: (body: {
    code: string;
    name: string;
    description?: string;
    category?: string;
    brand?: string;
    unitOfMeasure?: string;
    isHazardous?: boolean;
    requiresBatchTracking?: boolean;
    requiresSerialTracking?: boolean;
  }) => api.post<Product>('/product-master/products', body).then((r) => r.data),

  getProduct: (id: string) => api.get<Product>(`/product-master/products/${id}`).then((r) => r.data),

  updateProduct: (id: string, body: Partial<Product> & { revision?: number }) =>
    api.patch<Product>(`/product-master/products/${id}`, body).then((r) => r.data),

  submitProduct: (id: string) => api.post<Product>(`/product-master/products/${id}/submit`).then((r) => r.data),

  approveProduct: (id: string, approve = true, note?: string) =>
    api.post<Product>(`/product-master/products/${id}/approval`, { approve, note }).then((r) => r.data),

  listVariants: (params?: { status?: string; productId?: string }) =>
    api.get<ProductVariant[]>('/product-master/variants', { params }).then((r) => r.data),

  createVariant: (
    productId: string,
    body: { code: string; name: string; description?: string; attributes: Record<string, unknown> },
  ) => api.post<ProductVariant>(`/product-master/products/${productId}/variants`, body).then((r) => r.data),

  updateVariant: (variantId: string, body: Partial<ProductVariant> & { revision?: number }) =>
    api.patch<ProductVariant>(`/product-master/variants/${variantId}`, body).then((r) => r.data),

  approveVariant: (variantId: string, approve = true, note?: string) =>
    api.post<ProductVariant>(`/product-master/variants/${variantId}/approval`, { approve, note }).then((r) => r.data),

  allocateSku: (variantId: string) =>
    api.post<{ sku: string; allocated: boolean }>(`/product-master/variants/${variantId}/sku`).then((r) => r.data),

  addAlias: (body: {
    type: AliasType;
    value: string;
    productId?: string;
    variantId?: string;
    supplierRef?: string;
    customerRef?: string;
  }) => api.post<ProductAlias>('/product-master/aliases', body).then((r) => r.data),

  removeAlias: (aliasId: string) => api.put(`/product-master/aliases/${aliasId}/deactivate`).then((r) => r.data),

  resolveAlias: (type: AliasType, value: string) =>
    api.get<{ matched: boolean; alias: (ProductAlias & { variant?: ProductVariant | null; product?: Product | null }) | null }>(
      '/product-master/aliases/resolve',
      { params: { type, value } },
    ).then((r) => r.data),

  listAudit: (params?: { productId?: string; variantId?: string }) =>
    api.get<MasterDataAuditEvent[]>('/product-master/audit', { params }).then((r) => r.data),
};
