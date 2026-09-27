/**
 * Product Master — pure policy.
 *
 * Three ideas are encoded here, and each exists because the naive version
 * caused a real operational problem:
 *
 *  1. Product ≠ Variant ≠ SKU. A product is what a customer buys; a variant is
 *     the physical thing on a shelf; a SKU is a tenant-scoped identifier that,
 *     once issued, is never re-issued (not after a rename, a delisting, or a
 *     deleted row). Reusing a SKU silently rewrites stock history.
 *
 *  2. Variant identity is a *normalised* attribute fingerprint, so "RED",
 *     "red " and "Red" are one variant, not three. Duplicate master data is the
 *     root cause of most inventory-accuracy failure.
 *
 *  3. Approval is ordered: a variant cannot be approved before its parent
 *     product is approved, because otherwise stock is received against a
 *     variant that belongs to nothing.
 */

import { createHash } from 'crypto';

export type ProductApprovalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETIRED';

export type VariantApprovalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETIRED';

export const PRODUCT_STATUSES: ProductApprovalStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'RETIRED',
];

export const VARIANT_STATUSES: VariantApprovalStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'RETIRED',
];

/** Draft and pending records may be edited; approved/retired ones may not. */
export function isProductEditable(status: ProductApprovalStatus): boolean {
  return status === 'DRAFT' || status === 'PENDING_APPROVAL' || status === 'REJECTED';
}

export function isVariantEditable(status: VariantApprovalStatus): boolean {
  return status === 'DRAFT' || status === 'PENDING_APPROVAL' || status === 'REJECTED';
}

/**
 * A variant may only be approved once its parent product is approved. This is
 * the guard that stops "orphan" variants — the ones nobody can receive stock
 * against, but which appear in every pick list.
 */
export function canApproveVariant(parentStatus: ProductApprovalStatus): {
  ok: boolean;
  reason?: string;
} {
  if (parentStatus === 'APPROVED') return { ok: true };
  return {
    ok: false,
    reason: `The parent product must be APPROVED first (currently ${parentStatus})`,
  };
}

export function canApproveProduct(status: ProductApprovalStatus): boolean {
  return status === 'DRAFT' || status === 'PENDING_APPROVAL';
}

/** Approved master data is changed by re-approval of an explicit revision. */
export function requiresNewRevision(status: ProductApprovalStatus): boolean {
  return status === 'APPROVED';
}

/**
 * Optimistic concurrency: a caller holding a stale revision must not overwrite
 * a newer one. Master data is edited by several people; last-write-wins is how
 * descriptions and UoMs get clobbered.
 */
export function checkRevision(current: number, expected?: number | null): {
  ok: boolean;
  reason?: string;
} {
  if (expected === undefined || expected === null) return { ok: true };
  if (expected === current) return { ok: true };
  return {
    ok: false,
    reason: `Stale revision: you have ${expected} but the record is at ${current}. Reload before editing.`,
  };
}

// ── Attribute normalisation & fingerprinting ────────────────────────────────

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Normalise an attribute value so cosmetic differences do not create new
 * variants: trim, collapse internal whitespace, lowercase, and keep numbers
 * numeric. Nested objects/arrays are normalised recursively with sorted keys.
 */
export function normalizeAttributeValue(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const collapsed = value.trim().replace(/\s+/g, ' ');
    // Numeric strings ("12" and 12) are the same attribute value.
    if (collapsed !== '' && /^-?\d+(\.\d+)?$/.test(collapsed)) return Number(collapsed);
    return collapsed.toLowerCase();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const normalised = value.map(normalizeAttributeValue);
    // Attribute arrays are sets: order is not identity.
    return normalised.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, Json> = {};
    for (const key of Object.keys(src).sort()) {
      if (src[key] === undefined) continue;
      out[key.trim().toLowerCase()] = normalizeAttributeValue(src[key]);
    }
    return out;
  }
  return String(value);
}

export function normalizeAttributes(
  attributes: Record<string, unknown> | null | undefined,
): Record<string, Json> {
  const src = attributes ?? {};
  const out: Record<string, Json> = {};
  for (const key of Object.keys(src).sort()) {
    if (src[key] === undefined) continue;
    out[key.trim().toLowerCase()] = normalizeAttributeValue(src[key]);
  }
  return out;
}

/** SHA-256 over the normalised attribute set — the tenant-unique variant identity. */
export function computeAttributeFingerprint(
  attributes: Record<string, unknown> | null | undefined,
): string {
  const normalized = normalizeAttributes(attributes);
  const canonical = JSON.stringify(normalized);
  return createHash('sha256').update(canonical).digest('hex');
}

/** Fingerprint of the product's defining fields, used to spot near-duplicates. */
export function computeProductFingerprint(input: {
  name?: string | null;
  category?: string | null;
  brand?: string | null;
  unitOfMeasure?: string | null;
}): string {
  const canonical = JSON.stringify(normalizeAttributes({
    name: input.name ?? '',
    category: input.category ?? '',
    brand: input.brand ?? '',
    unitOfMeasure: input.unitOfMeasure ?? '',
  }));
  return createHash('sha256').update(canonical).digest('hex');
}

// ── SKU formatting ─────────────────────────────────────────────────────────

/**
 * Render the next SKU from a sequence. The number is the identity; the format
 * is presentation only, which is why the allocator stores the number and never
 * derives it back from a string.
 */
export function formatSku(
  number: number,
  options?: { prefix?: string; format?: string },
): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`SKU sequence number must be a positive integer (got ${number})`);
  }
  const prefix = options?.prefix?.trim() || 'SKU';
  const format = options?.format?.trim() || 'SKU-{number:05d}';
  const width = parseZeroPadWidth(format);
  const rendered = String(number).padStart(width, '0');
  return format
    .replace(/\{prefix\}/g, prefix)
    .replace(/\{number(?::0?\d+d)?\}/g, rendered);
}

function parseZeroPadWidth(format: string): number {
  const match = format.match(/\{number:0?(\d+)d\}/);
  if (!match) return 1;
  const width = Number(match[1]);
  return Number.isFinite(width) && width > 0 ? width : 1;
}

export interface SkuAllocation {
  sku: string;
  number: number;
  nextNumber: number;
  prefix: string;
  format: string;
}

export function buildSkuAllocation(sequence: {
  nextNumber: number;
  prefix?: string | null;
  format?: string | null;
}): SkuAllocation {
  const prefix = sequence.prefix?.trim() || 'SKU';
  const format = sequence.format?.trim() || 'SKU-{number:05d}';
  const number = sequence.nextNumber;
  return {
    sku: formatSku(number, { prefix, format }),
    number,
    nextNumber: number + 1,
    prefix,
    format,
  };
}

/**
 * Guard against an allocation ever moving backwards. A sequence that can
 * decrement can re-issue a SKU, which corrupts stock history permanently.
 */
export function assertSequenceProgresses(previousNext: number, newNext: number): void {
  if (newNext <= previousNext) {
    throw new Error(
      `SKU sequence must advance (previous next=${previousNext}, proposed next=${newNext})`,
    );
  }
}

// ── Aliases ────────────────────────────────────────────────────────────────

export type AliasType = 'BARCODE' | 'SUPPLIER_CODE' | 'CUSTOMER_CODE' | 'INTERNAL' | 'LEGACY';

export const ALIAS_TYPES: AliasType[] = [
  'BARCODE',
  'SUPPLIER_CODE',
  'CUSTOMER_CODE',
  'INTERNAL',
  'LEGACY',
];

export function normalizeAliasValue(value: string): string {
  return value.trim().toLowerCase();
}

/** Barcodes are the exception: leading zeros are significant, so only trim. */
export function normalizeAliasForType(type: AliasType, value: string): string {
  return type === 'BARCODE' ? value.trim() : normalizeAliasValue(value);
}

export function isValidBarcode(value: string): boolean {
  const digits = value.trim();
  return /^\d{8,14}$/.test(digits);
}

export interface AliasTarget {
  productId?: string | null;
  variantId?: string | null;
}

/** An alias must point at exactly one thing — a product or a variant, not both. */
export function validateAliasTarget(target: AliasTarget): { ok: boolean; reason?: string } {
  const hasProduct = !!target.productId;
  const hasVariant = !!target.variantId;
  if (hasProduct === hasVariant) {
    return {
      ok: false,
      reason: 'An alias must reference exactly one of productId or variantId',
    };
  }
  return { ok: true };
}

// ── Feature gate ───────────────────────────────────────────────────────────

function flag(value: string | undefined, fallback = false): boolean {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

/**
 * Product master data is a dependency of Process Control, so it follows the
 * same switch: off by default, and fail-closed in production unless a human
 * explicitly unlocks it.
 */
export function productMasterGate(env: NodeJS.ProcessEnv = process.env): {
  allowed: boolean;
  reason?: string;
} {
  if (env.NODE_ENV === 'production' && !flag(env.PRODUCT_MASTER_PRODUCTION_ALLOWED, false)) {
    return {
      allowed: false,
      reason:
        'Product Master is disabled in production (set PRODUCT_MASTER_PRODUCTION_ALLOWED=true only after the production gates are signed off)',
    };
  }
  if (!flag(env.PRODUCT_MASTER_ENABLED ?? env.PROCESS_CONTROL_ENABLED, false)) {
    return {
      allowed: false,
      reason: 'Product Master is disabled (PRODUCT_MASTER_ENABLED is not true)',
    };
  }
  return { allowed: true };
}
