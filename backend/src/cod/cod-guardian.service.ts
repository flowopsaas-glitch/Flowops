import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * CASH FLOW GUARDIAN — World-Class COD Intelligence
 *
 * The #1 uniquely African logistics feature. Nobody else has this.
 *
 * In Africa, 60%+ of deliveries are Cash on Delivery. This means drivers
 * carry significant amounts of cash daily. The Cash Flow Guardian:
 *
 * 1. DAILY CASH POSITION REPORT (18:00 WhatsApp to owner)
 *    → "R47,350 on the road | R12,800 deposited today | 3 drivers overdue"
 *
 * 2. DRIVER RISK SCORING (0-100)
 *    → Factors: balance age, settlement frequency, discrepancies, amount held
 *    → HIGH risk drivers flagged before theft happens
 *
 * 3. AUTO-LOCK DETECTION (flags drivers who should be locked)
 *    → If balance > R5,000 AND no settlement in 48h → flag for lock
 *    → Owner decides whether to lock (we don't auto-lock without consent)
 *
 * 4. DISCREPANCY DETECTION
 *    → COD collected on waybill but not in wallet (driver didn't record)
 *    → Wallet balance doesn't match transaction sum (data integrity)
 *
 * 5. CASH VELOCITY METRICS
 *    → Average time from collection to settlement per driver
 *    → Fastest/slowest settlers → identify patterns
 */

export interface DriverCashRisk {
  driverId: string;
  driverName: string;
  driverPhone: string;
  balance: number;
  riskScore: number; // 0-100 (higher = more risk)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  daysSinceLastSettlement: number;
  totalCollectedLifetime: number;
  shouldLock: boolean;
  lockReason?: string;
}

export interface CashPositionReport {
  generatedAt: string;
  companyName: string;
  /** Total cash currently held by all drivers */
  cashOnRoad: number;
  /** Total cash deposited/settled today */
  cashDepositedToday: number;
  /** Total COD collected today */
  cashCollectedToday: number;
  /** Number of drivers holding cash */
  driversHoldingCash: number;
  /** High-risk drivers (should settle urgently) */
  highRiskDrivers: DriverCashRisk[];
  /** Drivers recommended for job lock */
  lockRecommendations: DriverCashRisk[];
  /** Discrepancies found */
  discrepancies: Array<{ type: string; description: string; amount: number; driverId?: string }>;
  /** Cash velocity (avg hours from collection to settlement) */
  avgSettlementHours: number;
  /** WhatsApp summary message */
  whatsappMessage: string;
}

@Injectable()
export class CodGuardianService {
  private readonly logger = new Logger(CodGuardianService.name);
  // Configurable thresholds
  private readonly LOCK_BALANCE_THRESHOLD: number;
  private readonly LOCK_HOURS_THRESHOLD: number;
  private readonly HIGH_RISK_BALANCE: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.LOCK_BALANCE_THRESHOLD = parseFloat(config.get('COD_LOCK_BALANCE', '5000'));
    this.LOCK_HOURS_THRESHOLD = parseFloat(config.get('COD_LOCK_HOURS', '48'));
    this.HIGH_RISK_BALANCE = parseFloat(config.get('COD_HIGH_RISK_BALANCE', '3000'));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DAILY CASH POSITION CRON — 18:00 every day
  // ══════════════════════════════════════════════════════════════════════════

  @Cron('0 18 * * *')
  async dailyCashPositionAlert() {
    this.logger.log('💰 CASH FLOW GUARDIAN: Running daily cash position report...');

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true, brandName: true },
    });

    for (const company of companies) {
      try {
        const report = await this.generateCashPosition(company.id);
        if (report.cashOnRoad > 0 || report.highRiskDrivers.length > 0) {
          await this.sendOwnerWhatsApp(company.id, report.whatsappMessage);
        }
      } catch (err: any) {
        this.logger.error(`Cash position failed for ${company.name}: ${err.message}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CASH POSITION REPORT (called on-demand or by cron)
  // ══════════════════════════════════════════════════════════════════════════

  async generateCashPosition(companyId: string): Promise<CashPositionReport> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, brandName: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all driver wallets with positive balance
    const wallets = await this.prisma.driverWallet.findMany({
      where: { driver: { companyId } },
      include: { driver: { select: { id: true, name: true, phone: true, status: true } } },
    });

    // Today's transactions
    const todayCollections = await this.prisma.codTransaction.aggregate({
      where: { companyId, type: 'COLLECTION', createdAt: { gte: today } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const todaySettlements = await this.prisma.codTransaction.aggregate({
      where: { companyId, type: 'SETTLEMENT', createdAt: { gte: today } },
      _sum: { amount: true },
    });

    // Cash on road (total positive wallet balances)
    const cashOnRoad = wallets.reduce((sum, w) => sum + Math.max(0, w.balance), 0);
    const driversHoldingCash = wallets.filter(w => w.balance > 0).length;

    // Score each driver
    const driverRisks = await Promise.all(
      wallets.filter(w => w.balance > 0).map(w => this.scoreDriver(w, companyId)),
    );

    const highRiskDrivers = driverRisks.filter(d => d.riskLevel === 'HIGH' || d.riskLevel === 'CRITICAL');
    const lockRecommendations = driverRisks.filter(d => d.shouldLock);

    // Detect discrepancies
    const discrepancies = await this.detectDiscrepancies(companyId);

    // Cash velocity (average settlement speed)
    const avgSettlementHours = await this.calculateAvgSettlementSpeed(companyId);

    // Build WhatsApp message
    const whatsappMessage = this.buildWhatsAppMessage({
      companyName: company?.brandName || company?.name || 'Your Company',
      cashOnRoad,
      cashDepositedToday: todaySettlements._sum.amount || 0,
      cashCollectedToday: todayCollections._sum.amount || 0,
      driversHoldingCash,
      highRiskDrivers,
      lockRecommendations,
      discrepancies,
    });

    return {
      generatedAt: new Date().toISOString(),
      companyName: company?.brandName || company?.name || '',
      cashOnRoad: Math.round(cashOnRoad * 100) / 100,
      cashDepositedToday: Math.round((todaySettlements._sum.amount || 0) * 100) / 100,
      cashCollectedToday: Math.round((todayCollections._sum.amount || 0) * 100) / 100,
      driversHoldingCash,
      highRiskDrivers,
      lockRecommendations,
      discrepancies,
      avgSettlementHours,
      whatsappMessage,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRIVER RISK SCORING (0-100)
  // ══════════════════════════════════════════════════════════════════════════

  private async scoreDriver(wallet: any, _companyId: string): Promise<DriverCashRisk> {
    const factors: string[] = [];
    let score = 0;

    const balance = wallet.balance;
    const driver = wallet.driver;
    const daysSinceSettlement = wallet.lastSettledAt
      ? Math.floor((Date.now() - new Date(wallet.lastSettledAt).getTime()) / 86_400_000)
      : 999;

    // Factor 1: Balance amount (0-30 points)
    if (balance > 10000) { score += 30; factors.push(`Holding R${Math.round(balance).toLocaleString()} (very high)`); }
    else if (balance > 5000) { score += 20; factors.push(`Holding R${Math.round(balance).toLocaleString()} (high)`); }
    else if (balance > 2000) { score += 10; factors.push(`Holding R${Math.round(balance).toLocaleString()}`); }

    // Factor 2: Days since last settlement (0-30 points)
    if (daysSinceSettlement > 7) { score += 30; factors.push(`${daysSinceSettlement} days since last deposit (critical)`); }
    else if (daysSinceSettlement > 3) { score += 20; factors.push(`${daysSinceSettlement} days since last deposit`); }
    else if (daysSinceSettlement > 1) { score += 10; factors.push(`${daysSinceSettlement} days since last deposit`); }

    // Factor 3: Collection frequency without settlement (0-20 points)
    const recentCollections = await this.prisma.codTransaction.count({
      where: { walletId: wallet.id, type: 'COLLECTION', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    });
    const recentSettlements = await this.prisma.codTransaction.count({
      where: { walletId: wallet.id, type: 'SETTLEMENT', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    });
    if (recentCollections > 5 && recentSettlements === 0) {
      score += 20; factors.push(`${recentCollections} collections this week, 0 settlements`);
    } else if (recentCollections > 3 && recentSettlements === 0) {
      score += 10; factors.push(`${recentCollections} collections this week, 0 settlements`);
    }

    // Factor 4: Driver status (0-20 points)
    if (driver.status === 'OFFLINE' && balance > 1000) {
      score += 20; factors.push('Driver OFFLINE with cash — cannot be reached');
    }

    // Determine risk level
    const riskLevel: DriverCashRisk['riskLevel'] =
      score >= 70 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

    // Should lock?
    const shouldLock = balance >= this.LOCK_BALANCE_THRESHOLD &&
      daysSinceSettlement * 24 >= this.LOCK_HOURS_THRESHOLD;

    return {
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone,
      balance: Math.round(balance * 100) / 100,
      riskScore: Math.min(100, score),
      riskLevel,
      factors,
      daysSinceLastSettlement: daysSinceSettlement === 999 ? -1 : daysSinceSettlement,
      totalCollectedLifetime: wallet.totalCollected,
      shouldLock,
      lockReason: shouldLock
        ? `R${Math.round(balance).toLocaleString()} held for ${daysSinceSettlement}+ days without settlement`
        : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISCREPANCY DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  private async detectDiscrepancies(companyId: string) {
    const discrepancies: Array<{ type: string; description: string; amount: number; driverId?: string }> = [];

    // Check 1: Waybills marked codCollected but no matching COLLECTION transaction
    const collectedWaybills = await this.prisma.waybill.findMany({
      where: { companyId, codCollected: true, codAmount: { gt: 0 } },
      select: { id: true, trackingNumber: true, codAmount: true, codCollectedAt: true },
      orderBy: { codCollectedAt: 'desc' },
      take: 100,
    });

    // BATCH: Fetch all COD transactions for these waybills in ONE query
    const waybillIds = collectedWaybills.slice(0, 50).map(w => w.id);
    const existingTransactions = waybillIds.length > 0
      ? await this.prisma.codTransaction.findMany({
          where: { waybillId: { in: waybillIds }, type: 'COLLECTION' },
          select: { waybillId: true },
        })
      : [];
    const txWaybillIds = new Set(existingTransactions.map(t => t.waybillId));

    for (const wb of collectedWaybills.slice(0, 50)) {
      if (!txWaybillIds.has(wb.id)) {
        discrepancies.push({
          type: 'MISSING_TRANSACTION',
          description: `${wb.trackingNumber}: marked collected (R${wb.codAmount}) but no wallet transaction recorded`,
          amount: wb.codAmount || 0,
        });
      }
    }

    // Check 2: Wallet balance doesn't match transaction sum
    // BATCH: Use groupBy to get all wallet totals in TWO queries instead of 2 per wallet
    const wallets = await this.prisma.driverWallet.findMany({
      where: { driver: { companyId }, balance: { gt: 0 } },
      include: { driver: { select: { id: true, name: true } } },
      take: 20,
    });

    if (wallets.length > 0) {
      const walletIds = wallets.map(w => w.id);

      const collectionsByWallet = await this.prisma.codTransaction.groupBy({
        by: ['walletId'],
        where: { walletId: { in: walletIds }, type: 'COLLECTION' },
        _sum: { amount: true },
      });

      const settlementsByWallet = await this.prisma.codTransaction.groupBy({
        by: ['walletId'],
        where: { walletId: { in: walletIds }, type: 'SETTLEMENT' },
        _sum: { amount: true },
      });

      const collectionMap = new Map(collectionsByWallet.map(c => [c.walletId, c._sum.amount || 0]));
      const settlementMap = new Map(settlementsByWallet.map(s => [s.walletId, s._sum.amount || 0]));

      for (const wallet of wallets) {
        const collected = collectionMap.get(wallet.id) || 0;
        const settled = settlementMap.get(wallet.id) || 0;
        const expectedBalance = collected - settled;
        const diff = Math.abs(wallet.balance - expectedBalance);

        if (diff > 1) {
          discrepancies.push({
            type: 'BALANCE_MISMATCH',
            description: `${wallet.driver.name}: wallet shows R${wallet.balance.toFixed(2)} but transactions sum to R${expectedBalance.toFixed(2)} (diff: R${diff.toFixed(2)})`,
            amount: diff,
            driverId: wallet.driver.id,
          });
        }
      }
    }

    return discrepancies;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CASH VELOCITY (avg hours from collection to settlement)
  // ══════════════════════════════════════════════════════════════════════════

  private async calculateAvgSettlementSpeed(companyId: string): Promise<number> {
    const last30Days = new Date(Date.now() - 30 * 86_400_000);

    const settlements = await this.prisma.codTransaction.findMany({
      where: { companyId, type: 'SETTLEMENT', createdAt: { gte: last30Days } },
      select: { walletId: true, createdAt: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    if (settlements.length === 0) return 0;

    let totalHours = 0;
    let count = 0;

    for (const settlement of settlements.slice(0, 20)) {
      // Find the most recent collection before this settlement for the same wallet
      const lastCollection = await this.prisma.codTransaction.findFirst({
        where: {
          walletId: settlement.walletId,
          type: 'COLLECTION',
          createdAt: { lt: settlement.createdAt },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastCollection) {
        const hours = (settlement.createdAt.getTime() - lastCollection.createdAt.getTime()) / 3_600_000;
        totalHours += hours;
        count++;
      }
    }

    return count > 0 ? Math.round((totalHours / count) * 10) / 10 : 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WHATSAPP MESSAGE BUILDER
  // ══════════════════════════════════════════════════════════════════════════

  private buildWhatsAppMessage(data: {
    companyName: string;
    cashOnRoad: number;
    cashDepositedToday: number;
    cashCollectedToday: number;
    driversHoldingCash: number;
    highRiskDrivers: DriverCashRisk[];
    lockRecommendations: DriverCashRisk[];
    discrepancies: any[];
  }): string {
    const lines: string[] = [
      `💰 *Daily Cash Position — ${data.companyName}*`,
      ``,
      `📊 *Summary:*`,
      `• Cash on road: *R${Math.round(data.cashOnRoad).toLocaleString()}*`,
      `• Collected today: R${Math.round(data.cashCollectedToday).toLocaleString()}`,
      `• Deposited today: R${Math.round(data.cashDepositedToday).toLocaleString()}`,
      `• Drivers holding cash: ${data.driversHoldingCash}`,
    ];

    if (data.highRiskDrivers.length > 0) {
      lines.push(``, `🚨 *High Risk Drivers:*`);
      for (const d of data.highRiskDrivers.slice(0, 3)) {
        lines.push(`• ${d.driverName} — R${Math.round(d.balance).toLocaleString()} (${d.daysSinceLastSettlement}d overdue)`);
      }
    }

    if (data.lockRecommendations.length > 0) {
      lines.push(``, `🔒 *Lock Recommended:*`);
      for (const d of data.lockRecommendations.slice(0, 3)) {
        lines.push(`• ${d.driverName}: ${d.lockReason}`);
      }
    }

    if (data.discrepancies.length > 0) {
      lines.push(``, `⚠️ *Discrepancies: ${data.discrepancies.length} found*`);
      lines.push(`Check FlowOps → COD → Guardian for details.`);
    }

    lines.push(``, `_FlowOps Cash Flow Guardian_`);

    return lines.join('\n');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEND OWNER WHATSAPP (uses platform Business API)
  // ══════════════════════════════════════════════════════════════════════════

  private async sendOwnerWhatsApp(companyId: string, message: string) {
    const ownerWa = this.config.get<string>('OWNER_WHATSAPP');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');

    if (!ownerWa || !phoneNumberId || !accessToken) {
      this.logger.debug('Cash Flow Guardian: WhatsApp not configured — skipping alert');
      return;
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: ownerWa,
          type: 'text',
          text: { body: message },
        }),
      });
      this.logger.log(`💰 Cash Flow Guardian: Daily report sent to owner`);
    } catch (err: any) {
      this.logger.warn(`Cash Flow Guardian WhatsApp failed: ${err.message}`);
    }
  }
}
