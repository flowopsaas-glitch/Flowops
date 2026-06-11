import { Injectable } from '@nestjs/common';

@Injectable()
export class ForecastingService {
  forecast() {
    return {
      horizonWeeks: 13,
      projectedEndBalance: 980000,
      confidence: 0.87,
      risks: ['Delayed receivable from Client X'],
      generatedAt: new Date().toISOString(),
    };
  }
}
