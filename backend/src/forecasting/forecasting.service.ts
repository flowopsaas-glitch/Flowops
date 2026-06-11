import { Injectable } from '@nestjs/common';

@Injectable()
export class ForecastingService {
  generateForecast(cash: any) {
    return {
      projectedBalance: cash.balance * 0.92,
      riskLevel: cash.riskLevel,
      horizonMonths: 6,
    };
  }
}
