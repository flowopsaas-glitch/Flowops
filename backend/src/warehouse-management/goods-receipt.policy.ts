import { Money } from '../common/money.util';

/**
 * Goods receipt reconciliation policy (pure).
 *
 * The WMS already records what arrived. What it did not do is decide, in a
 * repeatable way, whether the receipt is *clean* or whether it must become an
 * owned exception. That decision is here, separated from the database, so the
 * rules the warehouse runs on are testable and reviewable.
 *
 * Reconciliation modes:
 *   • expected  — what the ASN / PO said would arrive
 *   • received  — what was counted at the dock
 *   • damaged   — units rejected on inspection
 *   • putAway   — where the good units were actually stored
 */

export type ReceiptOutcome = 'CLEAN' | 'EXCEPTION';

export interface ReceiptLineInput {
  sku: string;
  expectedQty?: number | null;
  receivedQty: number;
  damagedQty?: number | null;
  putAwayBinId?: string | null;
  knownVariant?: boolean;
}

export interface LineReconciliation {
  sku: string;
  expectedQty: number;
  receivedQty: number;
  damagedQty: number;
  goodQty: number;
  variance: number; // received - expected (negative = short)
  variancePct: number;
  hasVariance: boolean;
  hasDamage: boolean;
  needsPutAway: boolean;
  unknownSku: boolean;
}

export interface ReceiptReconciliation {
  outcome: ReceiptOutcome;
  lines: LineReconciliation[];
  totals: {
    expectedQty: number;
    receivedQty: number;
    damagedQty: number;
    goodQty: number;
    varianceQty: number;
  };
  incidents: ReceiptIncident[];
}

export interface ReceiptIncident {
  code: string;
  name: string;
  severity: 'MINOR' | 'MAJOR' | 'BLOCKING' | 'CRITICAL';
  isBlocking: boolean;
  sku?: string;
  detail: string;
}

export interface ReconcileOptions {
  /**
   * Percentage tolerance before a quantity difference is treated as an
   * exception rather than normal shrink (default 2%).
   */
  varianceTolerancePct?: number;
  /**
   * Absolute tolerance in units, applied on top of the percentage (default 0).
   * "±1 unit" is the normal reality on manual counts; declaring it explicitly
   * stops every receipt from raising an incident.
   */
  varianceToleranceUnits?: number;
  /** Require an explicit put-away location for every good unit (default true). */
  requirePutAway?: boolean;
}

export const DEFAULT_VARIANCE_TOLERANCE_PCT = 2;
export const DEFAULT_VARIANCE_TOLERANCE_UNITS = 0;

/**
 * Reconcile one receipt's lines against what was expected.
 *
 * Severity model:
 *   • damage > 0                      → MAJOR, non-blocking (quarantine the units, keep receiving)
 *   • damage on every received unit   → CRITICAL, blocking (nothing usable arrived)
 *   • short/over beyond tolerance     → MAJOR, non-blocking
 *   • unknown SKU                     → BLOCKING (stock cannot be booked to unmanaged master data)
 *   • good units with no put-away bin → BLOCKING when requirePutAway
 */
export function reconcileGoodsReceipt(
  lines: ReceiptLineInput[],
  options: ReconcileOptions = {},
): ReceiptReconciliation {
  const tolerancePct = options.varianceTolerancePct ?? DEFAULT_VARIANCE_TOLERANCE_PCT;
  const toleranceUnits = options.varianceToleranceUnits ?? DEFAULT_VARIANCE_TOLERANCE_UNITS;
  const requirePutAway = options.requirePutAway ?? true;

  const reconciled: LineReconciliation[] = [];
  const incidents: ReceiptIncident[] = [];

  for (const line of lines) {
    const expectedQty = Math.max(0, Number(line.expectedQty ?? 0));
    const receivedQty = Math.max(0, Number(line.receivedQty ?? 0));
    const damagedQty = Math.max(0, Math.min(Number(line.damagedQty ?? 0), receivedQty));
    const goodQty = Math.max(0, receivedQty - damagedQty);
    const variance = receivedQty - expectedQty;
    const variancePct = expectedQty > 0 ? (variance / expectedQty) * 100 : variance === 0 ? 0 : 100;

    // A PO with no expected quantity recorded cannot "vary" — the expectation
    // simply was not captured, and blaming the warehouse for our missing data
    // is how exception fatigue starts.
    const exceedsTolerance =
      expectedQty > 0 &&
      Math.abs(variance) > Math.max(toleranceUnits, (expectedQty * tolerancePct) / 100);

    const hasDamage = damagedQty > 0;
    const unknownSku = line.knownVariant === false;
    const needsPutAway = requirePutAway && goodQty > 0 && !line.putAwayBinId;

    const entry: LineReconciliation = {
      sku: line.sku,
      expectedQty,
      receivedQty,
      damagedQty,
      goodQty,
      variance,
      variancePct: round2(variancePct),
      hasVariance: exceedsTolerance,
      hasDamage,
      needsPutAway,
      unknownSku,
    };
    reconciled.push(entry);

    if (unknownSku) {
      incidents.push({
        code: 'UNKNOWN_SKU',
        name: 'SKU is not in governed master data',
        severity: 'BLOCKING',
        isBlocking: true,
        sku: line.sku,
        detail: `${line.sku} did not resolve to an approved product variant`,
      });
    }

    if (hasDamage) {
      const everythingDamaged = goodQty === 0 && receivedQty > 0;
      incidents.push({
        code: 'DAMAGED_GOODS',
        name: everythingDamaged ? 'All received units damaged' : 'Damaged units received',
        severity: everythingDamaged ? 'CRITICAL' : 'MAJOR',
        isBlocking: everythingDamaged,
        sku: line.sku,
        detail: `${damagedQty} of ${receivedQty} units damaged`,
      });
    }

    if (exceedsTolerance) {
      incidents.push({
        code: 'QUANTITY_VARIANCE',
        name: variance < 0 ? 'Short delivery' : 'Over delivery',
        severity: 'MAJOR',
        isBlocking: false,
        sku: line.sku,
        detail: `received ${receivedQty} vs expected ${expectedQty} (${entry.variancePct}%, tolerance ${tolerancePct}%)`,
      });
    }

    if (needsPutAway) {
      incidents.push({
        code: 'PUT_AWAY_MISSING',
        name: 'Goods received but not put away',
        severity: 'BLOCKING',
        isBlocking: true,
        sku: line.sku,
        detail: `${goodQty} good units have no put-away location`,
      });
    }
  }

  const totals = {
    expectedQty: reconciled.reduce((s, l) => s + l.expectedQty, 0),
    receivedQty: reconciled.reduce((s, l) => s + l.receivedQty, 0),
    damagedQty: reconciled.reduce((s, l) => s + l.damagedQty, 0),
    goodQty: reconciled.reduce((s, l) => s + l.goodQty, 0),
    varianceQty: reconciled.reduce((s, l) => s + l.variance, 0),
  };

  return {
    outcome: incidents.length === 0 ? 'CLEAN' : 'EXCEPTION',
    lines: reconciled,
    totals,
    incidents,
  };
}

/**
 * Should the receipt be blocked from completing? Only when the caller is
 * enforcing. Piloting uses the default (observe and record), because a new
 * standard that stops a live dock on day one gets switched off by the people
 * it was meant to help.
 */
export function shouldBlockCompletion(
  reconciliation: ReceiptReconciliation,
  enforcing: boolean,
): { blocked: boolean; reason?: string } {
  if (!enforcing) return { blocked: false };
  const blocking = reconciliation.incidents.filter((i) => i.isBlocking);
  if (blocking.length === 0) return { blocked: false };
  return {
    blocked: true,
    reason: blocking.map((i) => `${i.code} (${i.sku ?? 'receipt'}): ${i.detail}`).join('; '),
  };
}

/** The step code the goods-receipt process sits on when a receipt is clean. */
export function receiptIncidentSeverityToProcess(severity: ReceiptIncident['severity']): string {
  return severity;
}

function round2(value: number): number {
  return Money.round(value);
}
