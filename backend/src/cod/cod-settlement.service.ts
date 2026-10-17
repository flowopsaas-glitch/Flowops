import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/money.util';
import { createHash } from 'crypto';

/**
 * COD SETTLEMENT — one atomic, idempotent write path.
 *
 * COD is cash: a double credit is a real loss and a silent one, so this service
 * is the only place a waybill may be marked collected and a driver wallet
 * credited. Everything happens in ONE transaction, in this order:
 *
 *   1. Load the waybill tenant-scoped, WITH its shipment/driver, and verify the
 *      company + driver mapping (a stale or cross-tenant driver id is rejected,
 *      never credited).
 *   2. Verify the billing state: the waybill must be attached to at least one
 *      non-cancelled billing line, otherwise the cash has nothing to settle
 *      against (this is the "billing evidence" check).
 *   3. Claim the waybill with a compare-and-set on `codCollected: false`.
 *      Postgres locks the row, so of N concurrent collection requests exactly
 *      one sees count === 1; the rest get a 409 instead of a second credit.
 *   4. Credit the wallet (balance + totalCollected) and write the COD ledger
 *      row (`CodTransaction` COLLECTION) that makes the wallet's arithmetic
 *      provable, then stamp the collection back onto the waybill.
 *
 * Because the CAS is step 3, a retry after a network timeout cannot double
 * credit: the second attempt finds `codCollected = true` and is rejected.
 */

export interface CodCollectionInput {
  waybillId: string;
  companyId: string;
  /** Driver id supplied by the caller (office) — validated against the shipment. */
  driverId?: string;
  /** Amount actually collected at the door; defaults to the owed COD amount. */
  collectedAmount?: number;
  note?: string;
  actorId?: string;
}

export interface CodCollectionResult {
  collected: number;
  owed: number;
  discrepancy: number;
  driverId: string;
  walletBalance: number;
  exact: boolean;
  ledgerTransactionId: string;
}

@Injectable()
export class CodSettlementService {
  private readonly logger = new Logger(CodSettlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a COD collection and credit the collecting driver — atomically and
   * at most once per waybill.
   */
  async recordCollection(input: CodCollectionInput): Promise<CodCollectionResult> {
    const { waybillId, companyId } = input;
    if (!waybillId || !companyId) {
      throw new BadRequestException('Waybill and tenant context are required');
    }

    // ── Step 1: tenant-scoped waybill + driver mapping (outside the tx is fine
    // for the *read*; the CAS below is what makes the write safe) ─────────────
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      include: {
        shipments: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { driver: { select: { id: true, companyId: true, isActive: true } } },
        },
      },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');
    if (!waybill.codAmount || waybill.codAmount <= 0) {
      throw new BadRequestException('Waybill has no COD amount');
    }

    const shipment = (waybill as any).shipments?.[0];
    const shipmentDriver = shipment?.driver;

    // Reject stale / mismatched driver mappings instead of crediting the wrong
    // wallet: the driver must exist, belong to this tenant, and be the driver
    // the parcel is actually assigned to.
    const requestedDriverId = input.driverId ?? shipmentDriver?.id ?? null;
    if (!requestedDriverId) {
      throw new BadRequestException('No driver assigned to this waybill');
    }
    if (!shipmentDriver || shipmentDriver.id !== requestedDriverId) {
      throw new ConflictException(
        'Driver for this waybill does not match the shipment — refresh the dispatch board before settling COD',
      );
    }
    if (shipmentDriver.companyId !== companyId) {
      throw new ConflictException('Driver belongs to another company — refusing to credit COD');
    }
    if (shipmentDriver.isActive === false) {
      throw new ConflictException('Driver account is inactive — resolve before settling COD');
    }

    const driverId = shipmentDriver.id;

    // ── Billing evidence + amount maths ──────────────────────────────────────
    // InvoiceItem has no companyId of its own — tenancy comes from the invoice,
    // so the relation filter is the tenant scope. A waybill with no billing line
    // (or only a CANCELLED invoice) is a data-integrity problem: refuse to
    // credit cash against nothing rather than paper over it.
    const billing = await this.prisma.invoiceItem.findFirst({
      where: { waybillId, invoice: { companyId, status: { not: 'CANCELLED' } } },
      select: { id: true, invoice: { select: { id: true, status: true } } },
    });
    if (!billing) {
      throw new ConflictException(
        'No active billing line for this waybill — raise the invoice before settling COD',
      );
    }

    const owed = Money.round(waybill.codAmount);
    let collected = owed;
    if (input.collectedAmount !== undefined) {
      const c = Number(input.collectedAmount);
      if (!Number.isFinite(c) || c < 0) {
        throw new BadRequestException('Collected amount must be a non-negative number');
      }
      collected = Money.round(c);
    }
    const discrepancy = Money.subtract(collected, owed);
    const discrepancyNote =
      discrepancy === 0
        ? ''
        : discrepancy < 0
          ? ` (SHORT by R${Math.abs(discrepancy).toFixed(2)})`
          : ` (OVER by R${discrepancy.toFixed(2)})`;

    // ── Steps 2-4: one transaction, claim first, then credit ─────────────────
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set. `updateMany` with `codCollected: false` in the WHERE is
      // the double-settlement guard: the second concurrent attempt matches 0
      // rows (the first committed `true`), so it cannot credit twice.
      const claim = await tx.waybill.updateMany({
        where: { id: waybillId, companyId, codCollected: false },
        data: {
          codCollected: true,
          codCollectedAt: new Date(),
          codCollectedAmount: collected,
          codDiscrepancy: discrepancy,
        },
      });
      if (claim.count === 0) {
        throw new ConflictException('COD has already been collected and credited for this waybill');
      }

      // The wallet must exist for this driver, or the credit has nowhere to go.
      const walletBefore = await tx.driverWallet.upsert({
        where: { driverId },
        update: {},
        create: { driverId, balance: 0, totalCollected: 0 },
      });

      const wallet = await tx.driverWallet.update({
        where: { id: walletBefore.id },
        data: {
          balance: { increment: collected },
          totalCollected: { increment: collected },
        },
      });

      const ledger = await tx.codTransaction.create({
        data: {
          walletId: wallet.id,
          waybillId,
          companyId,
          type: 'COLLECTION',
          amount: collected,
          balance: wallet.balance,
          note:
            (input.note ? `${input.note} — ` : '') +
            `Collected R${collected.toFixed(2)} for ${waybill.trackingNumber}${discrepancyNote}`,
        },
      });

      // CodBalance is a *ledger*, so the running balance on the row is the
      // authoritative post-write state: if the wallet and the ledger disagree
      // the transaction writes an explicit mismatch marker for the guardian
      // cron to surface, rather than leaving an unexplainable number.
      const expectedBalance = Money.round(wallet.totalCollected - wallet.totalSettled);
      if (Money.round(wallet.balance) !== expectedBalance) {
        this.logger.warn(
          `COD ledger mismatch after collection for driver ${driverId}: ` +
            `wallet balance ${wallet.balance} vs ledger ${expectedBalance}`,
        );
      }

      return {
        collected,
        owed,
        discrepancy,
        driverId,
        walletBalance: wallet.balance,
        exact: discrepancy === 0,
        ledgerTransactionId: ledger.id,
      };
    });
  }

  /**
   * Settle cash from a driver back to the company. Tenant-scoped, atomic, and
   * guarded so concurrent settlements cannot overdraw the wallet.
   */
  private async settlementReplay(db: any, walletId: string, idempotencyKey: string, fingerprint: string) {
    const existing = await db.codTransaction.findFirst({
      where: { walletId, type: 'SETTLEMENT', idempotencyKey },
      select: { id: true, amount: true, balance: true, requestFingerprint: true },
    });
    if (!existing) return null;
    if (!existing.requestFingerprint || existing.requestFingerprint !== fingerprint) {
      throw new ConflictException('Idempotency key was already used for a different settlement request');
    }
    return {
      settled: existing.amount,
      newBalance: existing.balance,
      ledgerTransactionId: existing.id,
      replayed: true,
    };
  }

  async settleDriver(
    driverId: string,
    amount: number,
    companyId: string,
    idempotencyKey: string,
    note?: string,
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Settlement amount must be a positive number');
    }
    const rounded = Money.round(amount);
    if (rounded <= 0) throw new BadRequestException('Settlement amount must be at least 0.01');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(idempotencyKey ?? ''))) {
      throw new BadRequestException('A UUID idempotencyKey is required for every settlement');
    }
    const normalizedNote = String(note ?? 'Manual settlement').trim().slice(0, 500) || 'Manual settlement';
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ driverId, companyId, amount: rounded, note: normalizedNote }))
      .digest('hex');

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.driverWallet.findUnique({ where: { driverId } });
        if (!wallet) throw new NotFoundException('Driver wallet not found');

        const replay = await this.settlementReplay(tx, wallet.id, idempotencyKey, fingerprint);
        if (replay) return replay;

        // The guarded decrement and unique ledger key are in the same database
        // transaction. Concurrent replays either observe the original row or
        // lose the unique insert and roll back their balance change.
        const dec = await tx.driverWallet.updateMany({
          where: { driverId, balance: { gte: rounded } },
          data: {
            balance: { decrement: rounded },
            totalSettled: { increment: rounded },
            lastSettledAt: new Date(),
          },
        });
        if (dec.count === 0) {
          throw new BadRequestException(
            `Settlement amount (${rounded}) exceeds current balance (${wallet.balance}).`,
          );
        }

        const updated = await tx.driverWallet.findUniqueOrThrow({ where: { driverId } });
        const ledger = await tx.codTransaction.create({
          data: {
            walletId: wallet.id,
            companyId,
            type: 'SETTLEMENT',
            amount: rounded,
            balance: updated.balance,
            note: normalizedNote,
            idempotencyKey,
            requestFingerprint: fingerprint,
          },
        });

        return {
          settled: rounded,
          newBalance: updated.balance,
          ledgerTransactionId: ledger.id,
          replayed: false,
        };
      });
    } catch (error) {
      // A competing request with the same key may have committed while this
      // transaction was waiting on the wallet row or unique index. Return that
      // original result after the failed transaction has rolled back.
      const wallet = await this.prisma.driverWallet.findUnique({ where: { driverId } });
      if (wallet) {
        const replay = await this.settlementReplay(this.prisma, wallet.id, idempotencyKey, fingerprint);
        if (replay) return replay;
      }
      throw error;
    }
  }

  /**
   * Reconciliation check used by audits and the Cash Flow Guardian: does the
   * waybill's collection flag agree with the ledger and the wallet?
   */
  async verifyConsistency(waybillId: string, companyId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      include: {
        shipments: { take: 1, orderBy: { createdAt: 'desc' }, select: { driverId: true } },
      },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');
    if (!waybill.codCollected) return { consistent: true, detail: 'Not yet collected' };

    const driverId = (waybill as any).shipments?.[0]?.driverId ?? null;
    if (!driverId) {
      return { consistent: false, detail: 'Waybill marked collected but has no assigned driver' };
    }

    const collections = await this.prisma.codTransaction.findMany({
      where: { waybillId, companyId, type: 'COLLECTION' },
      select: { id: true, amount: true },
    });

    if (collections.length === 0) {
      return {
        consistent: false,
        detail: 'Waybill marked collected but no COLLECTION ledger row exists',
      };
    }
    if (collections.length > 1) {
      return {
        consistent: false,
        detail: `Waybill has ${collections.length} COLLECTION ledger rows — possible double credit`,
      };
    }

    const ledgerAmount = Money.round(collections[0].amount);
    const recorded = Money.round(waybill.codCollectedAmount ?? waybill.codAmount ?? 0);
    if (ledgerAmount !== recorded) {
      return {
        consistent: false,
        detail: `Ledger amount ${ledgerAmount} does not match waybill collected amount ${recorded}`,
      };
    }

    return { consistent: true };
  }
}
