import { Injectable } from '@nestjs/common';

@Injectable()
export class CashService {
  getCashPosition() {
    return { balance: 1250000, runwayMonths: 9, riskLevel: 'LOW' };
  }

  calculateCashPosition(input: any) {
    const base = this.getCashPosition();
    const revenueDrop = input?.assumptions?.revenueDropPercent ?? 0;

    // 🚀 FIXED: Division math restored
    const adjustedBalance = base.balance * (1 - (revenueDrop / 100));

    const riskLevel = revenueDrop >= 25 ? 'HIGH' : revenueDrop >= 10 ? 'MEDIUM' : 'LOW';

    return {
      balance: Math.round(adjustedBalance),
      runwayMonths: Math.max(3, base.runwayMonths - Math.ceil(revenueDrop / 10)),
      riskLevel,
    };
  }
}
